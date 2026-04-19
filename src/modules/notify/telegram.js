const axios = require("axios");

const { env } = require("../../config/env");
const logger = require("../../config/logger");

async function sendTelegramMessage(message) {
  if (!env.telegramEnabled) {
    return { sent: false, reason: "disabled" };
  }

  if (!env.telegramBotToken || !env.telegramChatId) {
    logger.warn(
      "Telegram is enabled but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing."
    );
    return { sent: false, reason: "missing_credentials" };
  }

  try {
    const url = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;
    await axios.get(url, {
      params: {
        chat_id: env.telegramChatId,
        text: message
      },
      timeout: 8000
    });

    return { sent: true };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error)
      },
      "Failed to send Telegram message"
    );
    return { sent: false, reason: "request_failed" };
  }
}

module.exports = {
  sendTelegramMessage
};
