const mongoose = require("mongoose");

const logger = require("./logger");

async function connectMongoDB(uri) {
  await mongoose.connect(uri);
  logger.info("MongoDB connected.");
}

async function disconnectMongoDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected.");
  }
}

module.exports = {
  connectMongoDB,
  disconnectMongoDB
};
