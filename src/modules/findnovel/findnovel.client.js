const axios = require("axios");
const http = require("http");
const https = require("https");

const { findnovelConfig } = require("../../config/findnovel");
const logger = require("../../config/logger");

const crawlerHttpClient = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false })
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) {
    return 0;
  }

  const numeric = Number(retryAfterHeader);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return Math.floor(numeric * 1000);
  }

  const retryDate = new Date(retryAfterHeader);
  if (Number.isNaN(retryDate.getTime())) {
    return 0;
  }

  return Math.max(0, retryDate.getTime() - Date.now());
}

function shouldRetryRequest(error) {
  const status = error && error.response ? Number(error.response.status) : 0;
  if ([408, 425, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const retryableCodes = new Set([
    "ECONNABORTED",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "EPIPE"
  ]);

  return Boolean(error && error.code && retryableCodes.has(error.code));
}

async function fetchHtmlFromCrawler(targetUrl, timeout = 20000) {
  const requestSettings = findnovelConfig.crawler;
  const requestUrl = `${requestSettings.gatewayUrl}?url=${encodeURIComponent(
    targetUrl
  )}`;
  const maxRetries = Math.max(0, Number(requestSettings.httpMaxRetries) || 0);
  const baseRetryDelayMs = Math.max(
    200,
    Number(requestSettings.httpRetryDelayMs) || 3000
  );
  const maxJitterMs = Math.max(0, Number(requestSettings.httpRetryJitterMs) || 0);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await crawlerHttpClient.get(requestUrl, { timeout });
      if (!response.data || !response.data.success || !response.data.htmlContent) {
        throw new Error(
          `Crawler gateway did not return valid HTML for ${targetUrl}`
        );
      }

      return response.data.htmlContent;
    } catch (error) {
      const isRetryable = shouldRetryRequest(error);
      const hasRetryLeft = attempt < maxRetries;
      if (!isRetryable || !hasRetryLeft) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(
        error && error.response && error.response.headers
          ? error.response.headers["retry-after"]
          : null
      );
      const jitterMs =
        maxJitterMs > 0 ? Math.floor(Math.random() * (maxJitterMs + 1)) : 0;
      const backoffMs =
        baseRetryDelayMs * Math.pow(2, Math.max(0, attempt)) + jitterMs;
      const waitMs = Math.max(retryAfterMs, backoffMs);

      logger.warn(
        {
          targetUrl,
          attempt: attempt + 1,
          maxRetries,
          waitMs,
          status:
            error && error.response ? Number(error.response.status) : undefined,
          error: error instanceof Error ? error.message : String(error)
        },
        "Crawler request failed, retrying with backoff"
      );

      await wait(waitMs);
    }
  }
}

module.exports = {
  fetchHtmlFromCrawler
};
