const axios = require("axios");
const http = require("http");
const https = require("https");

const { env } = require("../../config/env");

const crawlerHttpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false })
});

async function fetchHtmlFromCrawler(targetUrl, timeout = 20000) {
  const requestUrl = `${env.crawlerGatewayUrl}?url=${encodeURIComponent(
    targetUrl
  )}`;
  const response = await crawlerHttpClient.get(requestUrl, { timeout });

  if (!response.data || !response.data.success || !response.data.htmlContent) {
    throw new Error(`Crawler gateway did not return valid HTML for ${targetUrl}`);
  }

  return response.data.htmlContent;
}

module.exports = {
  fetchHtmlFromCrawler
};
