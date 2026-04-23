const schedule = require("node-schedule");

const { env } = require("../../config/env");
const { findnovelConfig } = require("../../config/findnovel");
const logger = require("../../config/logger");
const findnovelQueue = require("./findnovel.queue");

let latestReleaseJob = null;
let mainSyncJob = null;
let dailyMaintenanceJob = null;
let fixChapterJob = null;
let suspectedAuditJob = null;
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
    findnovelConfig.scheduler.latestReleaseCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueLatestRelease();
      logger.info(
        {
          cron: findnovelConfig.scheduler.latestReleaseCron,
          enqueueResult
        },
        "Triggered latest-release scheduler"
      );
    }
  );

  mainSyncJob = schedule.scheduleJob(
    findnovelConfig.scheduler.mainCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueMainSync();
      logger.info(
        {
          cron: findnovelConfig.scheduler.mainCron,
          enqueueResult
        },
        "Triggered main-sync scheduler"
      );
    }
  );

  dailyMaintenanceJob = schedule.scheduleJob(
    findnovelConfig.scheduler.dailyMaintenanceCron,
    () => {
      const enqueueResult = findnovelQueue.enqueueDailyMaintenance();
      logger.info(
        {
          cron: findnovelConfig.scheduler.dailyMaintenanceCron,
          enqueueResult
        },
        "Triggered daily-maintenance scheduler"
      );
    }
  );

  if (findnovelConfig.scheduler.fixChapterEnabled) {
    fixChapterJob = schedule.scheduleJob(
      findnovelConfig.scheduler.fixChapterCron,
      () => {
        const enqueueResult = findnovelQueue.enqueueFixChapter();
        logger.info(
          {
            cron: findnovelConfig.scheduler.fixChapterCron,
            enqueueResult
          },
          "Triggered fix-chapter scheduler"
        );
      }
    );
  }

  if (findnovelConfig.suspectedAudit.enabled) {
    suspectedAuditJob = schedule.scheduleJob(
      findnovelConfig.suspectedAudit.cron,
      () => {
        const enqueueResult = findnovelQueue.enqueueSuspectedAudit();
        logger.info(
          {
            cron: findnovelConfig.suspectedAudit.cron,
            enqueueResult
          },
          "Triggered suspected-audit scheduler"
        );
      }
    );
  }

  schedulerStarted = true;
  logger.info(
    {
      latestReleaseCron: findnovelConfig.scheduler.latestReleaseCron,
      mainSyncCron: findnovelConfig.scheduler.mainCron,
      dailyMaintenanceCron: findnovelConfig.scheduler.dailyMaintenanceCron,
      fixChapterEnabled: findnovelConfig.scheduler.fixChapterEnabled,
      fixChapterCron: findnovelConfig.scheduler.fixChapterCron,
      suspectedAuditEnabled: findnovelConfig.suspectedAudit.enabled,
      suspectedAuditCron: findnovelConfig.suspectedAudit.cron
    },
    "Findnovel scheduler started"
  );

  if (findnovelConfig.suspectedAudit.enabled && findnovelConfig.suspectedAudit.runOnStartup) {
    const suspectedAuditEnqueue = findnovelQueue.enqueueSuspectedAudit();
    logger.info(
      { suspectedAuditEnqueue },
      "Scheduler run-on-startup suspected-audit enqueued"
    );
  }

  if (findnovelConfig.scheduler.runOnStartup) {
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

  if (suspectedAuditJob) {
    suspectedAuditJob.cancel();
    suspectedAuditJob = null;
  }

  schedulerStarted = false;
  logger.info("Findnovel scheduler stopped");
}

module.exports = {
  startFindnovelScheduler,
  stopFindnovelScheduler
};
