const { upsertBySlug, findByNovelId } = require("./base.repository");
const { createChapterSafe } = require("./chapter.repository");
const { applyPagination, buildPagination, toPositiveInt } = require("./query.helpers");

module.exports = {
  applyPagination,
  buildPagination,
  createChapterSafe,
  findByNovelId,
  toPositiveInt,
  upsertBySlug
};
