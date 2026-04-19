const axios = require("axios");

const { env } = require("../../config/env");

async function fetchHtmlFromCrawler(targetUrl, timeout = 20000) {
  const requestUrl = `${env.crawlerGatewayUrl}?url=${encodeURIComponent(
    targetUrl
  )}`;
  const response = await axios.get(requestUrl, { timeout });

  if (!response.data || !response.data.success || !response.data.htmlContent) {
    throw new Error(`Crawler gateway did not return valid HTML for ${targetUrl}`);
  }

  return response.data.htmlContent;
}

module.exports = {
  fetchHtmlFromCrawler
};
