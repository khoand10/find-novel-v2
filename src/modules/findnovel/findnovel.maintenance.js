const Chapter = require("../../models/chapterModel");
const Novel = require("../../models/novelModel");
const NovelView = require("../../models/novelViewModel");
const cheerio = require("cheerio");
const { findnovelConfig } = require("../../config/findnovel");
const { fetchHtmlFromCrawler } = require("./findnovel.client");
const { parseChapterInfo } = require("./chapter.parser");
const repository = require("./findnovel.repository");
const { sendSuspectedRows } = require("../notify/gsheet");

const novelDramaChapterBaseUrl = "https://noveldrama.org/noveldrama";

function buildNovelDramaChapterUrl({ novelId, chapterId }) {
  if (!novelId || !chapterId) {
    return null;
  }

  return `${novelDramaChapterBaseUrl}/${encodeURIComponent(
    String(novelId)
  )}/${encodeURIComponent(String(chapterId))}`;
}

function getTextLength(content) {
  if (!content) {
    return 0;
  }

  const $ = cheerio.load(`<div>${content}</div>`);
  return $("div")
    .text()
    .replace(/\s+/g, " ")
    .trim().length;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));

  async function processOne() {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await worker(items[index], index);
      } catch (_error) {
        results[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => processOne()));
  return results;
}

async function updateHotNew() {
  await Novel.updateMany({}, { hot: false, new: false });

  const hotNovels = await Novel.find({}, { novel_id: 1, _id: 0 })
    .sort({ viewToDay: -1 })
    .limit(368)
    .lean();
  const newNovels = await Novel.find({}, { novel_id: 1, _id: 0 })
    .sort({ created_date: -1 })
    .limit(68)
    .lean();

  await Novel.updateMany(
    { novel_id: { $in: hotNovels.map((novel) => novel.novel_id) } },
    { hot: true }
  );
  await Novel.updateMany(
    { novel_id: { $in: newNovels.map((novel) => novel.novel_id) } },
    { new: true }
  );

  return {
    hotCount: hotNovels.length,
    newCount: newNovels.length
  };
}

async function updateNovelViews() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 29);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

  const novelIds = await Novel.distinct("novel_id");

  const batchSize = 50;
  let updated = 0;

  for (let i = 0; i < novelIds.length; i += batchSize) {
    const batch = novelIds.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (novelId) => {
        const [viewDayResult, viewWeekResult, viewMonthResult] =
          await Promise.all([
            NovelView.aggregate([
              { $match: { novel_id: novelId, date: todayStr } },
              { $group: { _id: null, totalViews: { $sum: "$views" } } }
            ]),
            NovelView.aggregate([
              {
                $match: {
                  novel_id: novelId,
                  date: { $gte: sevenDaysAgoStr, $lte: todayStr }
                }
              },
              { $group: { _id: null, totalViews: { $sum: "$views" } } }
            ]),
            NovelView.aggregate([
              {
                $match: {
                  novel_id: novelId,
                  date: { $gte: thirtyDaysAgoStr, $lte: todayStr }
                }
              },
              { $group: { _id: null, totalViews: { $sum: "$views" } } }
            ])
          ]);

        const viewToDay = viewDayResult[0] ? viewDayResult[0].totalViews : 0;
        const viewWeek = viewWeekResult[0] ? viewWeekResult[0].totalViews : 0;
        const viewMonth = viewMonthResult[0] ? viewMonthResult[0].totalViews : 0;

        await Novel.updateOne(
          { novel_id: novelId },
          {
            $set: {
              viewToDay,
              viewWeek,
              viewMonth
            }
          }
        );

        updated += 1;
      })
    );
  }

  return {
    updatedNovels: updated,
    totalNovelIds: novelIds.length
  };
}

async function updateLatestChapterForNovel(novelId) {
  const recentChapter = await Chapter.findOne({
    "novel.novel_id": novelId,
    premium_content: { $in: [null, false] }
  })
    .sort({ crawler_date: -1 })
    .lean();

  if (!recentChapter) {
    return { updated: false };
  }

  const updatePayload = {
    recentChapter: {
      chapter_id: recentChapter.chapter_id,
      chapter_name: recentChapter.chapter_name
    }
  };

  await Novel.updateOne({ novel_id: novelId }, updatePayload);

  await repository.touchNovelCrawlStateSync(novelId, {
    lastSyncedAt: new Date(),
    crawlerDate: new Date(),
    lastChapterUrl: recentChapter.chapter_url || undefined
  });

  return { updated: true };
}

async function fixRecentChapters({ windowMinutes = 30, limit = 200 } = {}) {
  const fromTime = new Date(Date.now() - Number(windowMinutes) * 60 * 1000);

  const crawlStates = await repository.findCrawlStatesForFix({
    fromTime,
    limit
  });

  let deletedChapters = 0;
  let updatedNovels = 0;

  for (const crawlState of crawlStates) {
    const deleteResult = await Chapter.deleteMany({
      "novel.novel_id": crawlState.novel_id,
      crawler_date: { $gte: fromTime }
    });
    deletedChapters += deleteResult.deletedCount || 0;

    const updateResult = await updateLatestChapterForNovel(crawlState.novel_id);
    if (updateResult.updated) {
      updatedNovels += 1;
    }
  }

  return {
    checkedNovels: crawlStates.length,
    deletedChapters,
    updatedNovels,
    windowMinutes: Number(windowMinutes)
  };
}

async function auditSuspectedChapters({
  topLimit = findnovelConfig.suspectedAudit.topLimit,
  minDelta = findnovelConfig.suspectedAudit.minDelta,
  minRatio = findnovelConfig.suspectedAudit.minRatio,
  concurrency = findnovelConfig.suspectedAudit.concurrency
} = {}) {
  const novels = await Novel.find(
    {},
    {
      novel_id: 1,
      novel_name: 1,
      viewWeek: 1
    }
  )
    .sort({ viewWeek: -1 })
    .limit(Number(topLimit))
    .lean();

  const rows = [];
  const results = await runWithConcurrency(novels, concurrency, async (novel) => {
    const localChapter = await Chapter.findOne(
      { "novel.novel_id": novel.novel_id, premium_content: { $in: [null, false] } },
      {
        chapter_id: 1,
        chapter_name: 1,
        chapter_url: 1,
        chapter_content: 1
      }
    )
      .sort({ crawler_date: -1 })
      .lean();

    if (!localChapter || !localChapter.chapter_url || !localChapter.chapter_content) {
      return null;
    }

    const html = await fetchHtmlFromCrawler(localChapter.chapter_url, 60000);
    const sourceChapter = parseChapterInfo(html, localChapter.chapter_url);
    if (!sourceChapter.success || !sourceChapter.chapter_content) {
      return null;
    }

    const localLength = getTextLength(localChapter.chapter_content);
    const sourceLength = getTextLength(sourceChapter.chapter_content);
    if (!localLength || !sourceLength || sourceLength <= localLength) {
      return null;
    }

    const delta = sourceLength - localLength;
    const ratio = sourceLength / Math.max(1, localLength);
    if (delta < Number(minDelta) || ratio < Number(minRatio)) {
      return null;
    }

    const chapterUrl =
      buildNovelDramaChapterUrl({
        novelId: novel.novel_id,
        chapterId: localChapter.chapter_id
      }) || localChapter.chapter_url;

    const description = `source longer: local=${localLength}, source=${sourceLength}, +${delta}, x${ratio.toFixed(
      2
    )}`;

    return {
      name: `${novel.novel_name || novel.novel_id} - ${localChapter.chapter_name}`,
      url: chapterUrl,
      description
    };
  });

  for (const row of results) {
    if (row) {
      rows.push(row);
    }
  }

  if (rows.length) {
    await sendSuspectedRows(rows);
  }

  return {
    totalNovels: novels.length,
    suspectedCount: rows.length,
    minDelta: Number(minDelta),
    minRatio: Number(minRatio),
    topLimit: Number(topLimit)
  };
}

module.exports = {
  auditSuspectedChapters,
  fixRecentChapters,
  updateHotNew,
  updateNovelViews
};
