const cheerio = require("cheerio");
const slug = require("slug");

function parseNovelInfo(htmlContent) {
  const $ = cheerio.load(htmlContent);

  const novelName = $("h1.novel-title").text().trim();
  const $descBlock = $(".content.expand-wrapper");
  $descBlock.find("p[id], a, div").remove();

  const lastChapterUrl = $(".links a").attr("href") || null;
  const bannerRaw = $(".cover img").attr("data-src") || $(".cover img").attr("src") || "";
  const authorRaw = $(".author a span").text().trim();
  const statusText = $(".ongoing").text().trim();

  const novelGenres = [];
  $(".categories ul li a").each((_index, element) => {
    const genre = $(element).text().trim().toUpperCase();
    if (genre) {
      novelGenres.push(genre);
    }
  });

  if (!novelName || !lastChapterUrl) {
    return null;
  }

  return {
    novel_name: novelName,
    novel_desc: $descBlock.html() || "",
    novel_victim_banner: bannerRaw.replace("findnovel.noveljk.org", "findnovel.net"),
    novel_author: authorRaw
      .replace("FindNovel.net", "NovelDrama.Org")
      .replace("FindNovel", "NovelDrama.Org"),
    novel_status: statusText === "Ongoing" ? 0 : 1,
    avgPointType2: 10,
    voteCountType2: 1,
    novel_genres: novelGenres,
    isPanda: false,
    first_chapter_url: lastChapterUrl,
    last_chapter_url: lastChapterUrl,
    novel_id: slug(novelName)
  };
}

function parseLatestReleasePage(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const results = [];

  $(".novel-list .novel-item").each((_index, element) => {
    const novelName = $(element).find(".item-body h4.novel-title").text().trim();
    const chapterName = $(element).find(".item-body h5.chapter-title").text().trim();
    const novelUrl = $(element).find(".item-body a").attr("href");

    if (novelName && chapterName && novelUrl) {
      results.push({
        novel_name: novelName,
        novel_id: slug(novelName),
        chapter_name: chapterName,
        novel_url: novelUrl
      });
    }
  });

  return results;
}

function parseDiscoverPage(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const urls = [];

  $(".novel-list .novel-item").each((_index, element) => {
    const novelUrl = $(element).find("a").attr("href");
    if (novelUrl) {
      urls.push(novelUrl);
    }
  });

  return urls;
}

module.exports = {
  parseNovelInfo,
  parseLatestReleasePage,
  parseDiscoverPage
};
