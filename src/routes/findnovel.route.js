const { Router } = require("express");
const slugModule = require("slug");
const slug = slugModule.default || slugModule;

const findnovelQueue = require("../modules/findnovel/findnovel.queue");
const findnovelRepository = require("../modules/findnovel/findnovel.repository");

const findnovelRouter = Router();

function extractNovelIdFromUrl(novelUrl) {
  try {
    const parsedUrl = new URL(String(novelUrl || "").trim());
    const match = parsedUrl.pathname.match(/\/book\/([^/]+)/i);
    if (!match || !match[1]) {
      return null;
    }

    return slug(match[1]);
  } catch (_error) {
    return null;
  }
}

// API duy nhất cho nghiệp vụ hiện tại:
// gửi link truyện -> crawl novel info + crawl chapter (mặc định)
findnovelRouter.post("/findnovel/novel-by-url", async (req, res) => {
  try {
    const { novelUrl, crawlChapters = true, urlStart = null, maxChapters = 0 } = req.body || {};

    if (!novelUrl) {
      return res.status(400).json({ message: "novelUrl is required" });
    }

    const novelId = extractNovelIdFromUrl(novelUrl);
    if (novelId) {
      const existingNovel = await findnovelRepository.findNovelByIdentity({
        novelId
      });

      if (existingNovel) {
        return res.status(409).json({
          message: `Novel already exists: ${
            existingNovel.novel_name || existingNovel.novel_id
          }`
        });
      }
    }

    const enqueueResult = await findnovelQueue.enqueueNovelByUrl({
      novelUrl,
      rejectIfExists: true,
      crawlChapters,
      urlStart,
      maxChapters
    });

    return res.status(202).json({
      ...enqueueResult,
      novelUrl
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to trigger crawl novel by url",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

findnovelRouter.post("/findnovel/latest-release", async (req, res) => {
  try {
    const { start, end } = req.body || {};
    const parsedStart = Number(start);
    const parsedEnd = Number(end);

    if (!Number.isInteger(parsedStart) || parsedStart <= 0) {
      return res.status(400).json({ message: "start must be a positive integer" });
    }

    if (!Number.isInteger(parsedEnd) || parsedEnd <= 0) {
      return res.status(400).json({ message: "end must be a positive integer" });
    }

    if (parsedEnd <= parsedStart) {
      return res
        .status(400)
        .json({ message: "end must be greater than start" });
    }

    const enqueueResult = await findnovelQueue.enqueueLatestRelease({
      start: parsedStart,
      end: parsedEnd
    });

    return res.status(200).json({
      ...enqueueResult,
      start: parsedStart,
      end: parsedEnd
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to trigger latest-release",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

module.exports = findnovelRouter;
