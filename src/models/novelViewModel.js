const mongoose = require("mongoose");

const novelViewSchema = new mongoose.Schema(
  {
    novel_id: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    views: { type: Number, default: 0 }
  },
  { timestamps: true }
);

novelViewSchema.index({ novel_id: 1, date: 1 }, { unique: true });

const NovelView = mongoose.model("NovelView", novelViewSchema);

module.exports = NovelView;
