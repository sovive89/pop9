import { sleep } from "../utils/sleep.js";

export class PrintServerService {
  constructor({
    jobRepository,
    jobProcessor,
    logger,
    pollIntervalMs,
    maxJobsPerPoll,
    errorBackoffMs,
  }) {
    this.jobRepository = jobRepository;
    this.jobProcessor = jobProcessor;
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.maxJobsPerPoll = maxJobsPerPoll;
    this.errorBackoffMs = errorBackoffMs;
    this.running = false;
  }

  async start() {
    if (this.running) return;

    this.running = true;
    this.logger.info("print server started");

    while (this.running) {
      try {
        await this.runIteration();
        await sleep(this.pollIntervalMs);
      } catch (error) {
        this.logger.error("print loop failure", { error });
        await sleep(this.errorBackoffMs);
      }
    }

    this.logger.info("print server stopped");
  }

  stop() {
    this.running = false;
  }

  async runIteration() {
    const candidates = await this.jobRepository.fetchCandidateJobs(this.maxJobsPerPoll);
    if (!candidates.length) {
      this.logger.debug("no print jobs available");
      return;
    }

    this.logger.info("print jobs fetched", { count: candidates.length });

    for (const candidate of candidates) {
      if (!this.running) break;

      const lockedJob = await this.jobRepository.lockJob(candidate);
      if (!lockedJob) {
        this.logger.debug("job already locked by another worker", { jobId: candidate.job_id });
        continue;
      }

      await this.jobProcessor.processLockedJob(lockedJob);
    }
  }
}
