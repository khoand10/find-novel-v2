const slugModule = require("slug");
const slug = slugModule.default || slugModule;

const logger = require("../../config/logger");
const { findnovelConfig } = require("../../config/findnovel");
const { fetchHtmlFromCrawler } = require("./findnovel.client");
const {
  parseDiscoverPage,
  parseLatestReleasePage,
  parseNovelInfo
} = require("./novel.parser");
const { parseChapterInfo } = require("./chapter.parser");
const repository = require("./findnovel.repository");
const { sendTelegramMessage } = require("../notify/telegram");
const { sendChapterSuccessRow } = require("../notify/gsheet");

const processedNovelIds = new Set();
const processedNovelIds2 = new Set();
const novelDramaChapterBaseUrl = "https://noveldrama.org/noveldrama";

function buildNovelDramaChapterUrl({ novelId, chapterId }) {
  if (!novelId || !chapterId) {
    return null;
  }

  return `${novelDramaChapterBaseUrl}/${encodeURIComponent(
    String(novelId)
  )}/${encodeURIComponent(String(chapterId))}`;
}

function buildNewChapterTelegramMessage({
  novelId,
  novelName,
  chapterId,
  chapterName
}) {
  const chapterUrl = buildNovelDramaChapterUrl({ novelId, chapterId });
  if (!chapterUrl) {
    return null;
  }

  return [
    "[FindNovel] Da cao thanh cong chapter moi",
    `${novelName || novelId} - ${chapterName || chapterId}`,
    chapterUrl
  ].join("\n");
}

function normalizeFindnovelUrl(url) {
  if (!url || typeof url !== "string") {
    return null;
  }

  let normalized = url
    .trim()
    .replace("findnovel.docsachhay.net", "findnovel.net")
    .replace("novel5s.org", "findnovel.net");

  if (!/^https?:\/\//i.test(normalized)) {
    const prefix = normalized.startsWith("/") ? "" : "/";
    normalized = `${findnovelConfig.baseUrl}${prefix}${normalized}`;
  }

  return normalized;
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  async function processOne() {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        const value = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = { status: "fulfilled", value };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => processOne()));
  return results;
}

async function crawlChapterByUrl(chapterUrl) {
  const normalizedUrl = normalizeFindnovelUrl(chapterUrl);
  if (!normalizedUrl) {
    throw new Error("chapterUrl is required");
  }

  const htmlContent = await fetchHtmlFromCrawler(normalizedUrl, 60000);
  return parseChapterInfo(htmlContent, normalizedUrl);
}

async function crawlChaptersForNovel(novel, options = {}) {
  if (!novel || !novel.novel_id) {
    throw new Error("novel is required");
  }

  const crawlState = novel.crawl_state || null;
  let nextChapterUrl = normalizeFindnovelUrl(
    options.urlStart || (crawlState ? crawlState.last_chapter_url : null)
  );
  const firstChapterUrl = normalizeFindnovelUrl(
    crawlState ? crawlState.first_chapter_url : null
  );
  const maxChapters = Number(options.maxChapters || 0);
  const crawlerDateBase = options.crawlerDateStart
    ? new Date(options.crawlerDateStart)
    : new Date();

  const visitedUrls = new Set();
  const summary = {
    novel_id: novel.novel_id,
    novel_name: novel.novel_name,
    visited: 0,
    created: 0,
    duplicated: 0,
    stoppedBecause: null
  };

  if (!nextChapterUrl) {
    summary.stoppedBecause = "missing_last_chapter_url";
    return summary;
  }

  let lastVisitedChapterUrl = null;

  while (nextChapterUrl) {
    if (visitedUrls.has(nextChapterUrl)) {
      summary.stoppedBecause = "cycle_detected";
      break;
    }

    visitedUrls.add(nextChapterUrl);
    summary.visited += 1;

    if (maxChapters && summary.visited > maxChapters) {
      summary.stoppedBecause = "max_chapters_reached";
      break;
    }

    logger.info(
      { novel_id: novel.novel_id, chapter_url: nextChapterUrl },
      "Crawling chapter"
    );

    const chapterInfo = await crawlChapterByUrl(nextChapterUrl);
    if (!chapterInfo.success || !chapterInfo.chapter_name || !chapterInfo.chapter_content) {
      summary.stoppedBecause = "invalid_chapter_content";
      break;
    }

    const existingChapter = await repository.findChapterByNovelAndName(
      novel.novel_id,
      chapterInfo.chapter_name
    );

    if (!existingChapter) {
      if (firstChapterUrl && nextChapterUrl === firstChapterUrl) {
        await repository.updateNovelFirstChapter(novel.novel_id, chapterInfo.chapter_name);
      }

      const crawlerDate = new Date(crawlerDateBase.getTime() + summary.visited * 3);

      const chapterResult = await repository.createChapterSafe({
        chapterName: chapterInfo.chapter_name,
        chapterContent: chapterInfo.chapter_content,
        chapterUrl: nextChapterUrl,
        crawlerDate,
        novelId: novel.novel_id,
        novelName: novel.novel_name
      });

      if (chapterResult.created && chapterResult.doc) {
        await repository.updateNovelRecentChapter(novel.novel_id, chapterResult.doc);
        summary.created += 1;

        const chapterSheetUrl =
          buildNovelDramaChapterUrl({
            novelId: chapterResult.doc.novel?.novel_id || novel.novel_id,
            chapterId: chapterResult.doc.chapter_id
          }) || chapterResult.doc.chapter_url || nextChapterUrl;

        if (chapterSheetUrl) {
          await sendChapterSuccessRow({
            name: chapterResult.doc.chapter_name,
            url: chapterSheetUrl
          });
        }

        const chapterMessage = buildNewChapterTelegramMessage({
          novelId: chapterResult.doc.novel?.novel_id || novel.novel_id,
          novelName: chapterResult.doc.novel?.novel_name || novel.novel_name,
          chapterId: chapterResult.doc.chapter_id,
          chapterName: chapterResult.doc.chapter_name
        });

        if (chapterMessage) {
          await sendTelegramMessage(chapterMessage);
        }
      } else {
        summary.duplicated += 1;
      }
    } else {
      summary.duplicated += 1;
    }

    if (!options.urlStart) {
      await repository.updateCrawlStateLastChapterUrl(novel.novel_id, nextChapterUrl);
    }

    lastVisitedChapterUrl = nextChapterUrl;
    nextChapterUrl = normalizeFindnovelUrl(chapterInfo.next_chapter_url);
  }

  if (summary.visited > 0) {
    await repository.touchNovelCrawlStateSync(novel.novel_id, {
      lastSyncedAt: new Date(),
      crawlerDate: new Date(),
      lastChapterUrl: options.urlStart ? undefined : lastVisitedChapterUrl
    });
  }

  if (summary.created > 0) {
    await sendTelegramMessage(
      `[FindNovel] ${summary.novel_name} (${summary.novel_id}) +${summary.created} chapter(s)`
    );
  }

  return summary;
}

async function crawlNovelByUrl(novelUrl, options = {}) {
  const normalizedNovelUrl = normalizeFindnovelUrl(novelUrl);
  if (!normalizedNovelUrl) {
    throw new Error("novelUrl is required");
  }

  const htmlContent = await fetchHtmlFromCrawler(normalizedNovelUrl, 20000);
  const parsedNovel = parseNovelInfo(htmlContent);
  if (!parsedNovel) {
    throw new Error(`Cannot parse novel details from ${normalizedNovelUrl}`);
  }
  const { initial_chapter_url: initialChapterUrl, ...novelPayload } = parsedNovel;

  const novelInDbByIdentity = await repository.findNovelByIdentity({
    novelName: novelPayload.novel_name,
    novelId: novelPayload.novel_id
  });

  if (options.rejectIfExists && novelInDbByIdentity) {
    const error = new Error(
      `Novel already exists: ${novelInDbByIdentity.novel_name || novelInDbByIdentity.novel_id}`
    );
    error.code = "NOVEL_ALREADY_EXISTS";
    error.statusCode = 409;
    throw error;
  }

  let novelInDb = novelInDbByIdentity;
  let created = false;

  if (!novelInDbByIdentity) {
    try {
      const upsertResult = await repository.upsertNovel(novelPayload);
      novelInDb = upsertResult.novel;
      created = upsertResult.created;

      if (!novelInDb) {
        novelInDb = await repository.findNovelByIdentity({
          novelName: novelPayload.novel_name,
          novelId: novelPayload.novel_id
        });
      }
    } catch (error) {
      if (!(error && error.code === 11000)) {
        throw error;
      }

      novelInDb = await repository.findNovelByIdentity({
        novelName: novelPayload.novel_name,
        novelId: novelPayload.novel_id
      });

      if (!novelInDb) {
        const duplicateError = new Error(
          `Novel conflicts with existing unique data but cannot be resolved by identity: ${novelPayload.novel_id}`
        );
        duplicateError.code = "NOVEL_CONFLICT_UNRESOLVED";
        duplicateError.statusCode = 409;
        throw duplicateError;
      }
    }
  }

  if (!novelInDb) {
    throw new Error(`Cannot load novel ${novelPayload.novel_id} after crawl`);
  }

  await repository.upsertNovelCrawlState({
    novelId: novelInDb.novel_id,
    source: "findnovel",
    firstChapterUrl: initialChapterUrl,
    lastChapterUrl: initialChapterUrl,
    sourceNovelUrl: normalizedNovelUrl,
    crawlerDate: new Date()
  });

  novelInDb = await repository.getNovelById(novelInDb.novel_id);

  let chapterSummary = null;
  if (
    options.crawlChapters !== false &&
    novelInDb &&
    novelInDb.crawl_state &&
    novelInDb.crawl_state.last_chapter_url
  ) {
    chapterSummary = await crawlChaptersForNovel(novelInDb, {
      urlStart: options.urlStart || null,
      maxChapters: options.maxChapters || 0,
      crawlerDateStart: options.crawlerDateStart || null
    });
  }

  return {
    created,
    novel: {
      novel_id: novelInDb.novel_id,
      novel_name: novelInDb.novel_name
    },
    chapterSummary
  };
}

async function getLatestReleaseNovels(start = 1, end = 25) {
  const results = [];

  for (let page = start; page < end; page += 1) {
    const pageUrl = `${findnovelConfig.baseUrl}/latest-release-novels?page=${page}`;
    logger.info({ page, pageUrl }, "Fetching latest-release page");

    try {
      const htmlContent = await fetchHtmlFromCrawler(pageUrl, 20000);
      const pageItems = parseLatestReleasePage(htmlContent);
      results.push(...pageItems);
    } catch (error) {
      logger.warn(
        {
          page,
          pageUrl,
          error: error instanceof Error ? error.message : String(error)
        },
        "Skip latest-release page due to crawler fetch error"
      );
    }
  }

  return results;
}

async function syncLatestRelease(options = {}) {
  const start = Number(options.start || findnovelConfig.scheduler.latestReleaseStart);
  const end = Number(options.end || findnovelConfig.scheduler.latestReleaseEnd);
  const concurrency = Number(
    options.concurrency || findnovelConfig.crawl.concurrencyCheck
  );

  const latestNovels = await getLatestReleaseNovels(start, end);
  const tasks = await runWithConcurrency(latestNovels, concurrency, async (novelVictim) => {
    if (processedNovelIds2.has(novelVictim.novel_id)) {
      return {
        type: "skip",
        novel_id: novelVictim.novel_id,
        reason: "duplicate_processing"
      };
    }

    processedNovelIds2.add(novelVictim.novel_id);
    try {
    const novelInfoDb = await repository.findNovelByIdentity({
      novelName: novelVictim.novel_name,
      novelId: novelVictim.novel_id
    });

    if (!novelInfoDb) {
      const crawlResult = await crawlNovelByUrl(novelVictim.novel_url, {
        crawlChapters: true
      });
      return {
        type: "create_novel",
        novel_id: crawlResult.novel.novel_id,
        created: crawlResult.created
      };
    }

    const latestChapter = await repository.findChapterByNovelAndName(
      novelInfoDb.novel_id,
      novelVictim.chapter_name
    );

    if (!latestChapter || latestChapter.premium_content) {
      const chapterSummary = await crawlChaptersForNovel(novelInfoDb);
      return {
        type: "sync_chapter",
        novel_id: novelInfoDb.novel_id,
        chapterSummary
      };
    }

    return {
      type: "skip",
      novel_id: novelInfoDb.novel_id,
      reason: "latest_chapter_exists"
    };
    } finally {
      processedNovelIds2.delete(novelVictim.novel_id);
    }
  });

  return {
    total: latestNovels.length,
    tasks
  };
}

async function discoverNewNovels(options = {}) {
  const start = Number(options.start || findnovelConfig.scheduler.discoverNewStart);
  const end = Number(options.end || findnovelConfig.scheduler.discoverNewEnd);
  const concurrency = Number(
    options.concurrency || findnovelConfig.crawl.concurrencyNovel
  );

  const novelUrls = [];
  for (let page = start; page < end; page += 1) {
    const pageUrl = `${findnovelConfig.baseUrl}/genre-all/sort-new/status-all/all-novel?page=${page}`;
    logger.info({ page, pageUrl }, "Fetching discover-new page");

    try {
      const htmlContent = await fetchHtmlFromCrawler(pageUrl, 20000);
      novelUrls.push(...parseDiscoverPage(htmlContent));
    } catch (error) {
      logger.warn(
        {
          page,
          pageUrl,
          error: error instanceof Error ? error.message : String(error)
        },
        "Skip discover-new page due to crawler fetch error"
      );
    }
  }

  const uniqueUrls = [...new Set(novelUrls.map((url) => normalizeFindnovelUrl(url)).filter(Boolean))];
  const tasks = await runWithConcurrency(uniqueUrls, concurrency, async (novelUrl) =>
    crawlNovelByUrl(novelUrl, {
      crawlChapters: options.crawlChapters !== false
    })
  );

  return {
    total: uniqueUrls.length,
    tasks
  };
}

async function syncExistingNovels(options = {}) {
  const novels = await repository.findNovelsForSync({
    novelIds: options.novelIds || [],
    limit: Number(options.limit || findnovelConfig.scheduler.syncExistingLimit)
  });

  const concurrency = Number(
    options.concurrency || findnovelConfig.crawl.concurrencyChapter
  );
  const tasks = await runWithConcurrency(novels, concurrency, async (novel) => {
    if (processedNovelIds.has(novel.novel_id)) {
      return {
        novel_id: novel.novel_id,
        novel_name: novel.novel_name,
        skipped: true,
        reason: "duplicate_processing"
      };
    }

    processedNovelIds.add(novel.novel_id);
    try {
      return await crawlChaptersForNovel(novel);
    } finally {
      processedNovelIds.delete(novel.novel_id);
    }
  });

  return {
    total: novels.length,
    tasks
  };
}

async function crawlNovelChaptersById(novelId, options = {}) {
  const normalizedNovelId = slug(String(novelId || "").trim());
  if (!normalizedNovelId) {
    throw new Error("novelId is required");
  }

  const novel = await repository.getNovelById(normalizedNovelId);
  if (!novel) {
    throw new Error(`Novel not found: ${normalizedNovelId}`);
  }

  return crawlChaptersForNovel(novel, options);
}

module.exports = {
  crawlChapterByUrl,
  crawlChaptersForNovel,
  crawlNovelByUrl,
  crawlNovelChaptersById,
  discoverNewNovels,
  getLatestReleaseNovels,
  normalizeFindnovelUrl,
  syncExistingNovels,
  syncLatestRelease
};
