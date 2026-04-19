const { Router } = require("express");

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
      crawlChapters,
      urlStart,
      maxChapters
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to crawl novel by url",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

module.exports = findnovelRouter;
