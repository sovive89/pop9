const LEVELS = ["debug", "info", "warn", "error"];

export class Logger {
  constructor(level = "info") {
    this.level = LEVELS.includes(level) ? level : "info";
  }

  shouldLog(level) {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
  }

  write(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    console.log(JSON.stringify(payload));
  }

  debug(message, meta) {
    this.write("debug", message, meta);
  }

  info(message, meta) {
    this.write("info", message, meta);
  }

  warn(message, meta) {
    this.write("warn", message, meta);
  }

  error(message, meta) {
    const details = meta?.error instanceof Error
      ? { ...meta, error: meta.error.message, stack: meta.error.stack }
      : meta;
    this.write("error", message, details);
  }
}
