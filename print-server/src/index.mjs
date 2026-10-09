import net from "node:net";
import { createClient } from "@supabase/supabase-js";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "POP9_AGENT_EMAIL", "POP9_AGENT_PASSWORD", "POP9_UNIT_ID"];
for (const key of required) if (!process.env[key]) throw new Error("Missing " + key);
const unitId = process.env.POP9_UNIT_ID;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});
const { error: loginError } = await supabase.auth.signInWithPassword({
  email: process.env.POP9_AGENT_EMAIL,
  password: process.env.POP9_AGENT_PASSWORD,
});
if (loginError) throw loginError;
const agentId = crypto.randomUUID();
console.log("POP9 Print Server online. Unit:", unitId, "Agent:", agentId);

async function sendTcp(host, port, bytes) {
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid TCP destination");
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(10000);
    socket.once("connect", () => socket.end(bytes));
    socket.once("error", reject);
    socket.once("timeout", () => socket.destroy(new Error("Printer timeout")));
    socket.once("close", hadError => { if (!hadError) resolve(); });
  });
}

async function tick() {
  // Atomic claim avoids two agents printing the same job concurrently.
  const { data: jobs, error } = await supabase.rpc("claim_print_jobs", {
    p_unit_id: unitId, p_agent_id: agentId, p_limit: 5,
  });
  if (error) throw error;
  for (const job of jobs ?? []) {
    try {
      const { data: printer, error: printerError } = await supabase.from("printer_configs")
        .select("id,host,port,transport,active,auto_cut,copies")
        .eq("id", job.printer_id).eq("business_unit_id", unitId).single();
      if (printerError || !printer?.active) throw new Error("Printer unavailable");
      if (printer.transport !== "tcp") throw new Error("This agent version supports TCP printers only");
      const text = Buffer.from(job.payload, "utf8");
      const copies = Math.min(10, Math.max(1, printer.copies ?? 1));
      for (let i = 0; i < copies; i++) await sendTcp(printer.host, printer.port, text);
      const { error: doneError } = await supabase.rpc("complete_print_job", {
        p_job_id: job.id, p_agent_id: agentId, p_success: true, p_error: null,
      });
      if (doneError) throw doneError;
      console.log("Sent:", job.id);
    } catch (err) {
      console.error("Failed:", job.id, err.message);
      await supabase.rpc("complete_print_job", {
        p_job_id: job.id, p_agent_id: agentId, p_success: false, p_error: String(err.message).slice(0, 300),
      });
    }
  }
}
const delay = Math.max(1000, Number(process.env.POLL_INTERVAL_MS) || 3000);
while (true) {
  try { await tick(); } catch (err) { console.error("Polling error:", err.message); }
  await new Promise(resolve => setTimeout(resolve, delay));
}
