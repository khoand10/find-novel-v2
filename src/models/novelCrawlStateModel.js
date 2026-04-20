const mongoose = require("mongoose");

const novelCrawlStateSchema = new mongoose.Schema(
  {
    novel_id: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      required: true,
      trim: true
    },
    first_chapter_url: {
      type: String,
      trim: true,
      default: null
    },
    last_chapter_url: {
      type: String,
      trim: true,
      default: null
    },
    last_synced_at: {
      type: Date,
      default: null
    },
    source_novel_url: {
      type: String,
      trim: true,
      default: null
    },
    crawler_date: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "novel_crawl_state"
  }
);

novelCrawlStateSchema.index({ novel_id: 1, source: 1 }, { unique: true });

const NovelCrawlState = mongoose.model("NovelCrawlState", novelCrawlStateSchema);

module.exports = NovelCrawlState;
