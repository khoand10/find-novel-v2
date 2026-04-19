const express = require("express");
const pinoHttp = require("pino-http");

const logger = require("./config/logger");
const healthRouter = require("./routes/health.route");
const findnovelRouter = require("./routes/findnovel.route");

const app = express();

app.use(express.json());
app.use(
  pinoHttp({
    logger
  })
);

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Crawler service is running."
  });
});

app.use("/api", healthRouter);
app.use("/api/crawler", findnovelRouter);

module.exports = app;
