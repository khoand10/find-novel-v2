const { Router } = require("express");

const findnovelQueue = require("../modules/findnovel/findnovel.queue");
const findnovelService = require("../modules/findnovel/findnovel.service");

const findnovelRouter = Router();

// API duy nhất cho nghiệp vụ hiện tại:
// gửi link truyện -> crawl novel info + crawl chapter (mặc định)
findnovelRouter.post("/findnovel/novel-by-url", async (req, res) => {
  try {
    const { novelUrl, crawlChapters = true, urlStart = null, maxChapters = 0 } = req.body || {};

    if (!novelUrl) {
      return res.status(400).json({ message: "novelUrl is required" });
    }

    const result = await findnovelService.crawlNovelByUrl(novelUrl, {
      rejectIfExists: true,
      crawlChapters,
      urlStart,
      maxChapters
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error && error.code === "NOVEL_ALREADY_EXISTS") {
      return res.status(error.statusCode || 409).json({
        message: error.message
      });
    }

    return res.status(500).json({
      message: "Failed to crawl novel by url",
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
