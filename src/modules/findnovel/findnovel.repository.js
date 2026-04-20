const slugModule = require("slug");
const slug = slugModule.default || slugModule;

const Novel = require("../../models/novelModel");
const Chapter = require("../../models/chapterModel");
const NovelCrawlState = require("../../models/novelCrawlStateModel");
const {
  createChapterSafe: createChapterSafeShared,
  findByNovelId,
  upsertBySlug
} = require("../../data/repositories");

const FINDNOVEL_SOURCE = "findnovel";

function buildChapterPayload({
  chapterName,
  chapterContent,
  chapterUrl,
  crawlerDate,
  novelId,
  novelName,
  premiumContent = false
}) {
  return {
    chapter_id: slug(chapterName),
    chapter_name: chapterName,
    chapter_content: chapterContent
      .replace(/En\.novelxo\.com/g, "noveldrama.org")
      .replace(/Novelebook\.com/g, "noveldrama.org"),
    chapter_url: chapterUrl || undefined,
    crawler_date: crawlerDate || undefined,
    premium_content: Boolean(premiumContent),
    novel: {
      novel_id: novelId,
      novel_name: novelName
    }
  };
}

function attachCrawlStateToNovel(novel, crawlState) {
  if (!novel) {
    return null;
  }

  return {
    ...novel,
    crawl_state: crawlState || null
  };
}

async function getCrawlStateByNovelId(novelId, source = FINDNOVEL_SOURCE) {
  if (!novelId) {
    return null;
  }

  return NovelCrawlState.findOne({ novel_id: novelId, source }).lean();
}

async function findNovelByIdentity({ novelName, novelId }) {
  const conditions = [];

  if (novelId) {
    conditions.push({ novel_id: novelId });
  }

  if (novelName) {
    conditions.push({ novel_id: slug(novelName) });
    conditions.push({ novel_id: slug(`${novelName} novel`) });
    conditions.push({ novel_name: novelName });
    conditions.push({ novel_ids: slug(novelName) });
  }

  if (!conditions.length) {
    return null;
  }

  const novel = await Novel.findOne({ $or: conditions })
    .sort({ crawler_date: -1 })
    .lean();

  if (!novel) {
    return null;
  }

  const crawlState = await getCrawlStateByNovelId(novel.novel_id);
  return attachCrawlStateToNovel(novel, crawlState);
}

async function upsertNovel(novelPayload) {
  const result = await upsertBySlug({
    model: Novel,
    slugField: "novel_id",
    slugValue: novelPayload.novel_id,
    payload: novelPayload,
    updateOnMatch: false
  });

  return {
    created: result.created,
    novel: result.doc
  };
}

async function createNovel(novelPayload) {
  const result = await upsertNovel(novelPayload);
  return result.novel;
}

async function upsertNovelCrawlState({
  novelId,
  source = FINDNOVEL_SOURCE,
  firstChapterUrl,
  lastChapterUrl,
  lastSyncedAt,
  sourceNovelUrl,
  crawlerDate
}) {
  if (!novelId) {
    throw new Error("novelId is required");
  }

  const filter = {
    novel_id: novelId,
    source
  };

  const existing = await NovelCrawlState.findOne(filter).lean();

  if (!existing) {
    const crawlState = await NovelCrawlState.create({
      novel_id: novelId,
      source,
      first_chapter_url: firstChapterUrl || lastChapterUrl || null,
      last_chapter_url: lastChapterUrl || firstChapterUrl || null,
      last_synced_at: lastSyncedAt || null,
      source_novel_url: sourceNovelUrl || null,
      crawler_date: crawlerDate || new Date()
    });

    return {
      created: true,
      crawlState: crawlState.toObject()
    };
  }

  const updatePayload = {
    crawler_date: crawlerDate || new Date()
  };

  if (!existing.first_chapter_url && firstChapterUrl) {
    updatePayload.first_chapter_url = firstChapterUrl;
  }

  if (lastChapterUrl) {
    updatePayload.last_chapter_url = lastChapterUrl;
  }

  if (lastSyncedAt) {
    updatePayload.last_synced_at = lastSyncedAt;
  }

  if (sourceNovelUrl) {
    updatePayload.source_novel_url = sourceNovelUrl;
  }

  await NovelCrawlState.updateOne(filter, { $set: updatePayload });

  return {
    created: false,
    crawlState: {
      ...existing,
      ...updatePayload
    }
  };
}

async function getNovelById(novelId) {
  const novel = await findByNovelId(Novel, novelId);
  if (!novel) {
    return null;
  }

  const crawlState = await getCrawlStateByNovelId(novelId);
  return attachCrawlStateToNovel(novel, crawlState);
}

async function findNovelsForSync({ novelIds = [], limit = 200 }) {
  const crawlStateQuery = {
    source: FINDNOVEL_SOURCE,
    last_chapter_url: /book/g
  };

  if (Array.isArray(novelIds) && novelIds.length) {
    crawlStateQuery.novel_id = { $in: novelIds };
  }

  const crawlStates = await NovelCrawlState.find(crawlStateQuery)
    .sort({ crawler_date: -1 })
    .limit(limit)
    .lean();

  if (!crawlStates.length) {
    return [];
  }

  const novels = await Novel.find({
    novel_id: { $in: crawlStates.map((state) => state.novel_id) }
  }).lean();

  const novelMap = new Map(novels.map((novel) => [novel.novel_id, novel]));

  return crawlStates
    .map((crawlState) => attachCrawlStateToNovel(novelMap.get(crawlState.novel_id), crawlState))
    .filter(Boolean);
}

async function findCrawlStatesForFix({ fromTime, limit = 200 }) {
  return NovelCrawlState.find(
    {
      source: FINDNOVEL_SOURCE,
      last_chapter_url: /findnovel|book/i,
      crawler_date: { $gte: fromTime }
    },
    { novel_id: 1, _id: 0 }
  )
    .sort({ crawler_date: -1 })
    .limit(Number(limit))
    .lean();
}

async function updateNovelFirstChapter(novelId, chapterName) {
  await Novel.updateOne(
    { novel_id: novelId },
    {
      firstChapter: {
        chapter_id: slug(chapterName),
        chapter_name: chapterName
      }
    }
  );
}

async function updateCrawlStateLastChapterUrl(novelId, chapterUrl) {
  if (!novelId || !chapterUrl) {
    return;
  }

  await NovelCrawlState.updateOne(
    { novel_id: novelId, source: FINDNOVEL_SOURCE },
    {
      $set: {
        last_chapter_url: chapterUrl,
        crawler_date: new Date()
      },
      $setOnInsert: {
        first_chapter_url: chapterUrl,
        source_novel_url: null,
        last_synced_at: null
      }
    },
    { upsert: true }
  );
}

async function touchNovelCrawlStateSync(
  novelId,
  { lastSyncedAt = new Date(), crawlerDate = new Date(), lastChapterUrl } = {}
) {
  if (!novelId) {
    return;
  }

  const setPayload = {
    last_synced_at: lastSyncedAt,
    crawler_date: crawlerDate
  };

  if (lastChapterUrl) {
    setPayload.last_chapter_url = lastChapterUrl;
  }

  await NovelCrawlState.updateOne(
    { novel_id: novelId, source: FINDNOVEL_SOURCE },
    {
      $set: setPayload,
      $setOnInsert: {
        first_chapter_url: lastChapterUrl || null,
        source_novel_url: null
      }
    },
    { upsert: true }
  );
}

async function updateNovelRecentChapter(novelId, chapterDoc) {
  await Novel.updateOne(
    { novel_id: novelId },
    {
      recentChapter: {
        chapter_id: chapterDoc.chapter_id,
        chapter_name: chapterDoc.chapter_name
      },
      $inc: { totalChapter: 1 },
      crawler_date: new Date()
    }
  );
}

async function findChapterByNovelAndName(novelId, chapterName) {
  const normalizedName = chapterName.replace("Chatper", "Chapter");

  return Chapter.findOne({
    $or: [
      { "novel.novel_id": novelId, chapter_name: chapterName },
      { "novel.novel_id": novelId, chapter_id: slug(chapterName) },
      { "novel.novel_id": novelId, chapter_id: slug(normalizedName) }
    ]
  })
    .sort({ crawler_date: -1 })
    .lean();
}

async function createChapterSafe(payload) {
  const chapterPayload = buildChapterPayload(payload);

  return createChapterSafeShared({
    model: Chapter,
    payload: chapterPayload,
    duplicateQuery: {
      "novel.novel_id": payload.novelId,
      chapter_id: chapterPayload.chapter_id
    }
  });
}

async function createChapter(payload) {
  const result = await createChapterSafe(payload);
  return result.doc;
}

module.exports = {
  createChapter,
  createChapterSafe,
  createNovel,
  findChapterByNovelAndName,
  findCrawlStatesForFix,
  findNovelByIdentity,
  findNovelsForSync,
  getCrawlStateByNovelId,
  getNovelById,
  touchNovelCrawlStateSync,
  updateCrawlStateLastChapterUrl,
  updateNovelFirstChapter,
  updateNovelRecentChapter,
  upsertNovel,
  upsertNovelCrawlState
};
