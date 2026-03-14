const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const loadConfig = () => ({
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  restaurantId: required("RESTAURANT_ID"),
  pollIntervalMs: parseNumber(process.env.POLL_INTERVAL_MS, 3000),
  maxJobsPerPoll: parseNumber(process.env.MAX_JOBS_PER_POLL, 20),
  maxRetries: parseNumber(process.env.MAX_RETRIES, 5),
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 10000),
  printerTimeoutMs: parseNumber(process.env.PRINTER_TIMEOUT_MS, 5000),
  errorBackoffMs: parseNumber(process.env.ERROR_BACKOFF_MS, 5000),
  logLevel: process.env.LOG_LEVEL ?? "info",
});
