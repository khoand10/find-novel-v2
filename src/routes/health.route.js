const { Router } = require("express");
const mongoose = require("mongoose");

const { getRedisClient } = require("../config/redis");

const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const redisClient = getRedisClient();

  const mongoStatus = mongoose.connection.readyState === 1 ? "up" : "down";
  const redisStatus = redisClient && redisClient.isReady ? "up" : "down";

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus
    }
  });
});

module.exports = healthRouter;
