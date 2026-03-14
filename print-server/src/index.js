import { loadConfig } from "./config/index.js";
import { Logger } from "./utils/logger.js";
import { JobRepository } from "./jobs/jobRepository.js";
import { EscPosFormatter } from "./formatters/escposFormatter.js";
import { TcpEscPosPrinterClient } from "./printers/tcpEscposClient.js";
import { JobProcessor } from "./jobs/jobProcessor.js";
import { PrintServerService } from "./services/printServerService.js";

const boot = async () => {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);

  logger.info("booting local print server", {
    restaurantId: config.restaurantId,
    pollIntervalMs: config.pollIntervalMs,
    maxRetries: config.maxRetries,
  });

  const jobRepository = JobRepository.fromConfig(config);
  const formatter = new EscPosFormatter();
  const printerClient = new TcpEscPosPrinterClient({
    timeoutMs: config.printerTimeoutMs,
    logger,
  });

  const jobProcessor = new JobProcessor({
    jobRepository,
    formatter,
    printerClient,
    logger,
    maxRetries: config.maxRetries,
  });

  const service = new PrintServerService({
    jobRepository,
    jobProcessor,
    logger,
    pollIntervalMs: config.pollIntervalMs,
    maxJobsPerPoll: config.maxJobsPerPoll,
    errorBackoffMs: config.errorBackoffMs,
  });

  const shutdown = (signal) => {
    logger.info("shutdown signal received", { signal });
    service.stop();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await service.start();
};

boot().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
