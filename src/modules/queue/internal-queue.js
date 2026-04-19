class InternalQueue {
  constructor({
    name,
    concurrency = 1,
    processor,
    logger,
    maxRetries = 0,
    retryDelayMs = 0,
    retryBackoffMultiplier = 2,
    onSuccess = null,
    onFailure = null
  }) {
    if (!name) {
      throw new Error("Queue name is required");
    }

    if (typeof processor !== "function") {
      throw new Error("Queue processor must be a function");
    }

    this.name = name;
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.processor = processor;
    this.logger = logger;
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
    this.retryBackoffMultiplier = Math.max(
      1,
      Number(retryBackoffMultiplier) || 1
    );
    this.onSuccess = typeof onSuccess === "function" ? onSuccess : null;
    this.onFailure = typeof onFailure === "function" ? onFailure : null;

    this.pending = [];
    this.running = 0;
    this.sequence = 0;

    this.activeKeys = new Set();
    this.pendingKeys = new Set();
    this.completed = 0;
    this.failed = 0;
    this.retried = 0;
    this.recentResults = [];
  }

  enqueue(payload, options = {}) {
    const dedupe = options.dedupe !== false;
    const key = options.key || null;

    if (dedupe && key && (this.pendingKeys.has(key) || this.activeKeys.has(key))) {
      return {
        accepted: false,
        reason: "duplicate_key",
        key
      };
    }

    this.sequence += 1;
    const job = {
      id: `${this.name}-${this.sequence}`,
      payload,
      key,
      retryState: {
        retriesLeft:
          options.maxRetries === undefined
            ? this.maxRetries
            : Math.max(0, Number(options.maxRetries) || 0),
        initialRetries:
          options.maxRetries === undefined
            ? this.maxRetries
            : Math.max(0, Number(options.maxRetries) || 0),
        retryDelayMs:
          options.retryDelayMs === undefined
            ? this.retryDelayMs
            : Math.max(0, Number(options.retryDelayMs) || 0),
        retryBackoffMultiplier:
          options.retryBackoffMultiplier === undefined
            ? this.retryBackoffMultiplier
            : Math.max(1, Number(options.retryBackoffMultiplier) || 1)
      },
      createdAt: new Date().toISOString()
    };

    this.pending.push(job);
    if (key) {
      this.pendingKeys.add(key);
    }

    this._drain();

    return {
      accepted: true,
      jobId: job.id,
      key
    };
  }

  getStats() {
    return {
      name: this.name,
      concurrency: this.concurrency,
      pending: this.pending.length,
      running: this.running,
      completed: this.completed,
      failed: this.failed,
      retried: this.retried,
      activeKeys: this.activeKeys.size,
      pendingKeys: this.pendingKeys.size,
      recentResults: this.recentResults
    };
  }

  _pushRecentResult(result) {
    this.recentResults.unshift(result);
    if (this.recentResults.length > 30) {
      this.recentResults = this.recentResults.slice(0, 30);
    }
  }

  _drain() {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      this._runJob(job);
    }
  }

  async _runJob(job) {
    this.running += 1;

    if (job.key) {
      this.pendingKeys.delete(job.key);
      this.activeKeys.add(job.key);
    }

    const startedAt = Date.now();

    try {
      const result = await this.processor(job.payload, job);
      this.completed += 1;

      this._pushRecentResult({
        jobId: job.id,
        status: "completed",
        key: job.key,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        resultSummary: this._safePreview(result)
      });

      if (this.onSuccess) {
        await this.onSuccess(job, result);
      }
    } catch (error) {
      const shouldRetry = job.retryState && job.retryState.retriesLeft > 0;
      if (shouldRetry) {
        const retryAttempt =
          job.retryState.initialRetries - job.retryState.retriesLeft + 1;
        const delayMs = Math.floor(
          job.retryState.retryDelayMs *
            Math.pow(job.retryState.retryBackoffMultiplier, retryAttempt - 1)
        );

        job.retryState.retriesLeft -= 1;
        this.retried += 1;

        this._pushRecentResult({
          jobId: job.id,
          status: "retrying",
          key: job.key,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          retryAttempt,
          retriesLeft: job.retryState.retriesLeft,
          retryDelayMs: delayMs,
          error: error instanceof Error ? error.message : String(error)
        });

        if (job.key) {
          this.pendingKeys.add(job.key);
        }

        setTimeout(() => {
          this.pending.push(job);
          this._drain();
        }, delayMs);

        if (this.logger) {
          this.logger.warn(
            {
              queue: this.name,
              jobId: job.id,
              retryAttempt,
              retriesLeft: job.retryState.retriesLeft,
              retryDelayMs: delayMs,
              error: error instanceof Error ? error.message : String(error)
            },
            "Internal queue job failed, retrying"
          );
        }
      } else {
        this.failed += 1;

        this._pushRecentResult({
          jobId: job.id,
          status: "failed",
          key: job.key,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });

        if (this.logger) {
          this.logger.error(
            {
              queue: this.name,
              jobId: job.id,
              error: error instanceof Error ? error.message : String(error)
            },
            "Internal queue job failed"
          );
        }

        if (this.onFailure) {
          await this.onFailure(job, error);
        }
      }
    } finally {
      if (job.key) {
        this.activeKeys.delete(job.key);
      }

      this.running -= 1;
      setImmediate(() => this._drain());
    }
  }

  _safePreview(value) {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value !== "object") {
      return value;
    }

    const keys = Object.keys(value).slice(0, 8);
    const preview = {};
    for (const key of keys) {
      preview[key] = value[key];
    }

    return preview;
  }
}

module.exports = InternalQueue;
