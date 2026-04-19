const Chapter = require("../../models/chapterModel");
const Novel = require("../../models/novelModel");
const NovelView = require("../../models/novelViewModel");

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

  if (recentChapter.chapter_url) {
    updatePayload.last_chapter_url = recentChapter.chapter_url;
  }

  await Novel.updateOne({ novel_id: novelId }, updatePayload);
  return { updated: true };
}

async function fixRecentChapters({ windowMinutes = 30, limit = 200 } = {}) {
  const fromTime = new Date(Date.now() - Number(windowMinutes) * 60 * 1000);

  const novels = await Novel.find(
    {
      last_chapter_url: /findnovel|book/i,
      crawler_date: { $gte: fromTime }
    },
    { novel_id: 1, _id: 0 }
  )
    .sort({ crawler_date: -1 })
    .limit(Number(limit))
    .lean();

  let deletedChapters = 0;
  let updatedNovels = 0;

  for (const novel of novels) {
    const deleteResult = await Chapter.deleteMany({
      "novel.novel_id": novel.novel_id,
      crawler_date: { $gte: fromTime }
    });
    deletedChapters += deleteResult.deletedCount || 0;

    const updateResult = await updateLatestChapterForNovel(novel.novel_id);
    if (updateResult.updated) {
      updatedNovels += 1;
    }
  }

  return {
    checkedNovels: novels.length,
    deletedChapters,
    updatedNovels,
    windowMinutes: Number(windowMinutes)
  };
}

module.exports = {
  fixRecentChapters,
  updateHotNew,
  updateNovelViews
};
