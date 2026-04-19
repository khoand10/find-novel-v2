const slug = require("slug");

const Novel = require("../../models/novelModel");
const Chapter = require("../../models/chapterModel");

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

  return Novel.findOne({ $or: conditions }).sort({ crawler_date: -1 }).lean();
}

async function createNovel(novelPayload) {
  const novel = await Novel.create(novelPayload);
  return novel.toObject();
}

async function getNovelById(novelId) {
  return Novel.findOne({ novel_id: novelId }).lean();
}

async function findNovelsForSync({ novelIds = [], limit = 200 }) {
  const query = {
    last_chapter_url: /book/g
  };

  if (Array.isArray(novelIds) && novelIds.length) {
    query.novel_id = { $in: novelIds };
  }

  return Novel.find(query).sort({ crawler_date: -1 }).limit(limit).lean();
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

async function updateNovelLastChapterUrl(novelId, chapterUrl) {
  await Novel.updateOne({ novel_id: novelId }, { last_chapter_url: chapterUrl });
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

async function createChapter({
  chapterName,
  chapterContent,
  chapterUrl,
  crawlerDate,
  novelId,
  novelName,
  premiumContent = false
}) {
  const payload = {
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

  const chapter = await Chapter.create(payload);
  return chapter.toObject();
}

module.exports = {
  createChapter,
  createNovel,
  findChapterByNovelAndName,
  findNovelByIdentity,
  findNovelsForSync,
  getNovelById,
  updateNovelFirstChapter,
  updateNovelLastChapterUrl,
  updateNovelRecentChapter
};
