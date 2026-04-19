const cheerio = require("cheerio");

function cleanupChapterDom($) {
  $("p").each(function removeEmptyParagraph() {
    if (!$(this).text().trim()) {
      $(this).remove();
    }
  });

  $('[id^="pf-"][id$="-1"]').remove();
  $(".box-ads").remove();
  $(".box-notification").remove();
  $('p[data-type="_mgwidget"]').remove();
  $('a[href="https://novelfire.net"]').remove();
  $("#fb-root").remove();
  $(".alert-info.text-center").remove();
  $("#mgw1624573_0429d").remove();
  $('span[style="height:1px;width:0;overflow:hidden;display:inline-block"]').remove();
}

function normalizeChapterContent(content) {
  if (!content) {
    return null;
  }

  return content
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<n[^\s>]*>.*?<\/n[^\s>]*>/g, "")
    .replace(/FindNovel.net/g, "NovelDrama.Org")
    .replace(/FindNovel/g, "NovelDrama.Org")
    .replace(/Search the.{0,190} quality/g, "")
    .trim();
}

function parseChapterInfo(htmlContent, sourceUrl) {
  const $ = cheerio.load(htmlContent);
  cleanupChapterDom($);

  const chapterContent = normalizeChapterContent($("#content").html());
  const chapterNameRaw = $(".breadcrumb.show-dots a:nth-child(5)")
    .text()
    .replace("M Chapter", "Chapter")
    .replace("by Marina Vittori", "")
    .replace("by Chestnut", "")
    .trim();
  const nextChapterRaw = $('a[title="Next Chapter"]').attr("href") || null;

  const nextChapterUrl =
    nextChapterRaw &&
    nextChapterRaw !== sourceUrl &&
    !nextChapterRaw.includes("javascript:;")
      ? nextChapterRaw.replace("novel5s.org", "findnovel.net")
      : null;

  if (!chapterNameRaw || !chapterContent) {
    return {
      success: false,
      chapter_name: null,
      chapter_content: null,
      next_chapter_url: null
    };
  }

  return {
    success: true,
    chapter_name: chapterNameRaw.replace(/(\b\d+(?:\.\d+)?)\s*-\s*\1:/g, "$1:").trim(),
    chapter_content: chapterContent,
    next_chapter_url: nextChapterUrl
  };
}

module.exports = {
  parseChapterInfo
};
