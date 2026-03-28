export class JobProcessor {
  constructor({ jobRepository, formatter, printerClient, logger, maxRetries }) {
    this.jobRepository = jobRepository;
    this.formatter = formatter;
    this.printerClient = printerClient;
    this.logger = logger;
    this.maxRetries = maxRetries;
  }

  async processLockedJob(job) {
    const retryCount = Number(job.retry_count ?? 0);

    try {
      const printer = await this.jobRepository.getPrinter(job.printer_id);
      if (!printer) {
        throw new Error(`Printer not found: ${job.printer_id}`);
      }
      if (!printer.enabled) {
        throw new Error(`Printer disabled: ${job.printer_id}`);
      }

      const bytes = this.formatter.buildTicket(job, printer);
      await this.printerClient.send(printer, bytes);
      await this.jobRepository.markPrinted(job.job_id);

      this.logger.info("job printed", {
        jobId: job.job_id,
        printerId: job.printer_id,
        eventType: job.event_type,
      });
    } catch (error) {
      const nextRetry = retryCount + 1;
      await this.jobRepository.markFailed(job.job_id, nextRetry);

      const meta = {
        jobId: job.job_id,
        printerId: job.printer_id,
        retryCount: nextRetry,
        maxRetries: this.maxRetries,
        error,
      };

      if (nextRetry >= this.maxRetries) {
        this.logger.error("job permanently failed", meta);
      } else {
        this.logger.warn("job failed, scheduled for retry", meta);
      }
    }
  }
}
