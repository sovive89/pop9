import test from "node:test";
import assert from "node:assert/strict";
import { JobProcessor } from "../src/jobs/jobProcessor.js";

test("JobProcessor marks job as printed on success", async () => {
  let markPrintedCalled = false;
  let markFailedCalled = false;

  const processor = new JobProcessor({
    maxRetries: 3,
    logger: { info() {}, warn() {}, error() {} },
    formatter: { buildTicket() { return Buffer.from("PRINT_OK"); } },
    printerClient: { async send() {} },
    jobRepository: {
      async getPrinter() {
        return { id: "printer-1", enabled: true, ip_address: "127.0.0.1", port: 9100 };
      },
      async markPrinted(jobId) {
        markPrintedCalled = jobId === "job-1";
      },
      async markFailed() {
        markFailedCalled = true;
      },
    },
  });

  await processor.processLockedJob({
    job_id: "job-1",
    printer_id: "printer-1",
    event_type: "ORDER_CREATED",
    retry_count: 0,
    payload: {},
  });

  assert.equal(markPrintedCalled, true);
  assert.equal(markFailedCalled, false);
});

test("JobProcessor increments retry on print failure", async () => {
  let failedRetryCount = null;

  const processor = new JobProcessor({
    maxRetries: 3,
    logger: { info() {}, warn() {}, error() {} },
    formatter: { buildTicket() { return Buffer.from("PRINT_FAIL"); } },
    printerClient: {
      async send() {
        throw new Error("Printer offline");
      },
    },
    jobRepository: {
      async getPrinter() {
        return { id: "printer-1", enabled: true, ip_address: "127.0.0.1", port: 9100 };
      },
      async markPrinted() {},
      async markFailed(_jobId, retryCount) {
        failedRetryCount = retryCount;
      },
    },
  });

  await processor.processLockedJob({
    job_id: "job-2",
    printer_id: "printer-1",
    event_type: "ORDER_CREATED",
    retry_count: 1,
    payload: {},
  });

  assert.equal(failedRetryCount, 2);
});
