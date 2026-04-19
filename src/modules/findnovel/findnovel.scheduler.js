const schedule = require("node-schedule");

const { env } = require("../../config/env");
const logger = require("../../config/logger");
const findnovelQueue = require("./findnovel.queue");

let latestReleaseJob = null;
let mainSyncJob = null;
let dailyMaintenanceJob = null;
let fixChapterJob = null;
let schedulerStarted = false;

function startFindnovelScheduler() {
  if (schedulerStarted) {
    return;
  }

  if (!env.schedulerEnabled) {
    logger.info("Scheduler disabled by env SCHEDULER_ENABLED.");
    return;
  }

  latestReleaseJob = schedule.scheduleJob(
    env.schedulerLatestReleaseCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueLatestRelease();
      logger.info(
        {
          cron: env.schedulerLatestReleaseCron,
          enqueueResult
        },
        "Triggered latest-release scheduler"
      );
    }
  );

  mainSyncJob = schedule.scheduleJob(
    env.schedulerMainCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueMainSync();
      logger.info(
        {
          cron: env.schedulerMainCron,
          enqueueResult
        },
        "Triggered main-sync scheduler"
      );
    }
  );

  dailyMaintenanceJob = schedule.scheduleJob(
    env.schedulerDailyMaintenanceCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueDailyMaintenance();
      logger.info(
        {
          cron: env.schedulerDailyMaintenanceCron,
          enqueueResult
        },
        "Triggered daily-maintenance scheduler"
      );
    }
  );

  if (env.schedulerFixChapterEnabled) {
    fixChapterJob = schedule.scheduleJob(
      env.schedulerFixChapterCron,
      () => {
        const enqueueResult = findnovelQueue.enqueueFixChapter();
        logger.info(
          {
            cron: env.schedulerFixChapterCron,
            enqueueResult
          },
          "Triggered fix-chapter scheduler"
        );
      }
    );
  }

  schedulerStarted = true;
  logger.info(
    {
      latestReleaseCron: env.schedulerLatestReleaseCron,
      mainSyncCron: env.schedulerMainCron,
      dailyMaintenanceCron: env.schedulerDailyMaintenanceCron,
      fixChapterEnabled: env.schedulerFixChapterEnabled,
      fixChapterCron: env.schedulerFixChapterCron
    },
    "Findnovel scheduler started"
  );

  if (env.schedulerRunOnStartup) {
    const latestReleaseEnqueue = findnovelQueue.enqueueLatestRelease();
    const mainSyncEnqueue = findnovelQueue.enqueueMainSync();
    const dailyMaintenanceEnqueue = findnovelQueue.enqueueDailyMaintenance({
      reason: "startup"
    });
    logger.info(
      { latestReleaseEnqueue, mainSyncEnqueue, dailyMaintenanceEnqueue },
      "Scheduler run-on-startup jobs enqueued"
    );
  }
}

function stopFindnovelScheduler() {
  if (latestReleaseJob) {
    latestReleaseJob.cancel();
    latestReleaseJob = null;
  }

  if (mainSyncJob) {
    mainSyncJob.cancel();
    mainSyncJob = null;
  }

  if (dailyMaintenanceJob) {
    dailyMaintenanceJob.cancel();
    dailyMaintenanceJob = null;
  }

  if (fixChapterJob) {
    fixChapterJob.cancel();
    fixChapterJob = null;
  }

  schedulerStarted = false;
  logger.info("Findnovel scheduler stopped");
}

module.exports = {
  startFindnovelScheduler,
  stopFindnovelScheduler
};
