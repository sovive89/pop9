import test from "node:test";
import assert from "node:assert/strict";
import { PrintServerService } from "../src/services/printServerService.js";

test("PrintServerService processes only jobs successfully locked", async () => {
  const processed = [];

  const service = new PrintServerService({
    pollIntervalMs: 1,
    maxJobsPerPoll: 10,
    errorBackoffMs: 1,
    logger: { info() {}, debug() {}, error() {} },
    jobRepository: {
      async fetchCandidateJobs() {
        return [
          { job_id: "job-1", status: "PENDING" },
          { job_id: "job-2", status: "PENDING" },
        ];
      },
      async lockJob(job) {
        if (job.job_id === "job-1") return { ...job, status: "PROCESSING" };
        return null;
      },
    },
    jobProcessor: {
      async processLockedJob(job) {
        processed.push(job.job_id);
      },
    },
  });

  service.running = true;
  await service.runIteration();
  service.stop();

  assert.deepEqual(processed, ["job-1"]);
});
