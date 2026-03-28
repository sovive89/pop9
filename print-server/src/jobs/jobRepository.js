import { createClient } from "@supabase/supabase-js";
import { createTimedFetch } from "../utils/http.js";

const JOB_FIELDS = "job_id, restaurant_id, printer_id, event_type, payload, status, retry_count, created_at, processed_at";
const PRINTER_FIELDS = "id, restaurant_id, name, location, ip_address, port, printer_type, enabled";

export class JobRepository {
  constructor({ supabase, restaurantId, maxRetries }) {
    this.supabase = supabase;
    this.restaurantId = restaurantId;
    this.maxRetries = maxRetries;
  }

  static fromConfig(config) {
    const supabase = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          fetch: createTimedFetch(config.requestTimeoutMs),
        },
      },
    );

    return new JobRepository({
      supabase,
      restaurantId: config.restaurantId,
      maxRetries: config.maxRetries,
    });
  }

  async fetchCandidateJobs(limit) {
    const { data, error } = await this.supabase
      .from("print_jobs")
      .select(JOB_FIELDS)
      .eq("restaurant_id", this.restaurantId)
      .in("status", ["PENDING", "FAILED"])
      .lt("retry_count", this.maxRetries)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  async lockJob(job) {
    const { data, error } = await this.supabase
      .from("print_jobs")
      .update({ status: "PROCESSING" })
      .eq("restaurant_id", this.restaurantId)
      .eq("job_id", job.job_id)
      .eq("status", job.status)
      .select(JOB_FIELDS)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async getPrinter(printerId) {
    const { data, error } = await this.supabase
      .from("printers")
      .select(PRINTER_FIELDS)
      .eq("restaurant_id", this.restaurantId)
      .eq("id", printerId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async markPrinted(jobId) {
    const { error } = await this.supabase
      .from("print_jobs")
      .update({
        status: "PRINTED",
        processed_at: new Date().toISOString(),
      })
      .eq("restaurant_id", this.restaurantId)
      .eq("job_id", jobId)
      .eq("status", "PROCESSING");

    if (error) throw error;
  }

  async markFailed(jobId, retryCount) {
    const { error } = await this.supabase
      .from("print_jobs")
      .update({
        status: "FAILED",
        retry_count: retryCount,
        processed_at: new Date().toISOString(),
      })
      .eq("restaurant_id", this.restaurantId)
      .eq("job_id", jobId)
      .eq("status", "PROCESSING");

    if (error) throw error;
  }
}
