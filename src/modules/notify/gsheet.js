const axios = require("axios");

const { env } = require("../../config/env");
const { findnovelConfig } = require("../../config/findnovel");
const logger = require("../../config/logger");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhookWithInlineRetry(payload) {
  const retries = Math.max(0, Number(findnovelConfig.gsheet.inlineRetryCount) || 0);
  const timeout = Math.max(1000, Number(findnovelConfig.gsheet.webhookTimeoutMs) || 8000);
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      await axios.post(env.gsheetWebAppUrl, payload, { timeout });
      return { sent: true, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt <= retries) {
        await wait(400);
      }
    }
  }

  logger.error(
    {
      error: lastError instanceof Error ? lastError.message : String(lastError),
      payload
    },
    "Failed to send Google Sheet webhook"
  );

  return { sent: false, reason: "request_failed" };
}

async function sendRowsToGSheet({ fileName, logType, rows }) {
  if (!findnovelConfig.gsheet.enabled) {
    return { sent: false, reason: "disabled" };
  }

  if (!env.gsheetWebAppUrl) {
    logger.warn("GSHEET_WEB_APP_URL is missing. Skip Google Sheet webhook.");
    return { sent: false, reason: "missing_webhook_url" };
  }

  if (!fileName || !logType || !Array.isArray(rows) || !rows.length) {
    return { sent: false, reason: "invalid_payload" };
  }

  return postWebhookWithInlineRetry({
    fileName,
    logType,
    rows
  });
}

async function sendChapterSuccessRow(row) {
  return sendRowsToGSheet({
    fileName: findnovelConfig.gsheet.successFileName,
    logType: "success",
    rows: [row]
  });
}

async function sendSuspectedRows(rows) {
  return sendRowsToGSheet({
    fileName: findnovelConfig.gsheet.suspectFileName,
    logType: "suspected",
    rows
  });
}

module.exports = {
  sendChapterSuccessRow,
  sendRowsToGSheet,
  sendSuspectedRows
};
