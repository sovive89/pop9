// Twilio Verify (SMS). Credenciais só como secrets do servidor; nunca em tabela nem na tela.
export const TWILIO_SECRETS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const;
type Env = { get(name: string): string | undefined };
export const twilioConfigured = (env: Env) => TWILIO_SECRETS.every((name) => Boolean(env.get(name)));

/** Celular brasileiro em dígitos com DDI 55 (formato do CRM); vazio se inválido. */
export function normalizeBrPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : "";
}

async function verifyCall(env: Env, path: string, params: Record<string, string>, fetcher: typeof fetch) {
  const service = encodeURIComponent(env.get("TWILIO_VERIFY_SERVICE_SID") ?? "");
  const auth = btoa(`${env.get("TWILIO_ACCOUNT_SID")}:${env.get("TWILIO_AUTH_TOKEN")}`);
  return await fetcher(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

export async function startVerification(env: Env, phone: string, fetcher: typeof fetch = fetch) {
  const response = await verifyCall(env, "Verifications", { To: `+${phone}`, Channel: "sms", Locale: "pt-BR" }, fetcher);
  return response.ok;
}

export async function checkVerification(env: Env, phone: string, code: string, fetcher: typeof fetch = fetch) {
  const response = await verifyCall(env, "VerificationCheck", { To: `+${phone}`, Code: code }, fetcher);
  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return data?.status === "approved";
}
