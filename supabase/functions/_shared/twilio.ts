// Twilio Verify (SMS). Credenciais só no servidor: Secrets das Edge Functions ou Vault do banco.
export const TWILIO_SECRETS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const;
export type TwilioConfig = { accountSid: string; authToken: string; verifyServiceSid: string };
type Env = { get(name: string): string | undefined };
type Rpc = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

const valid = (c: Partial<TwilioConfig> | null | undefined): c is TwilioConfig =>
  Boolean(c && /^AC[0-9a-f]{32}$/i.test(c.accountSid ?? "") && (c.authToken ?? "").length >= 16 && /^VA[0-9a-f]{32}$/i.test(c.verifyServiceSid ?? ""));

export function twilioFromEnv(env: Env): TwilioConfig | null {
  const config = { accountSid: env.get("TWILIO_ACCOUNT_SID") ?? "", authToken: env.get("TWILIO_AUTH_TOKEN") ?? "", verifyServiceSid: env.get("TWILIO_VERIFY_SERVICE_SID") ?? "" };
  return valid(config) ? config : null;
}

/** Credenciais da unidade (Vault, cadastradas em Conexões); os Secrets TWILIO_* valem como padrão da plataforma. */
export async function loadTwilio(env: Env, db: Rpc, unit: string): Promise<TwilioConfig | null> {
  try {
    const { data, error } = await db.rpc("twilio_credentials", { p_unit: unit });
    if (!error && valid(data as Partial<TwilioConfig>)) return data as TwilioConfig;
  } catch { /* sem a migration ou sem segredo: tenta os Secrets */ }
  return twilioFromEnv(env);
}

/** Dica mascarada para mostrar na tela, sem revelar o identificador inteiro. */
export const maskSid = (sid: string) => `${sid.slice(0, 2)}…${sid.slice(-4)}`;

/** Nome completo: pelo menos duas palavras com 2+ letras, sem números (mesma regra do banco). */
export function fullName(value: unknown): string {
  if (typeof value !== "string") return "";
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 5 || name.length > 80 || /[0-9@]/.test(name)) return "";
  return name.split(" ").filter((word) => word.length >= 2).length >= 2 ? name : "";
}

/** Celular brasileiro em dígitos com DDI 55 (formato do CRM); vazio se inválido. */
export function normalizeBrPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : "";
}

const authHeader = (c: TwilioConfig) => `Basic ${btoa(`${c.accountSid}:${c.authToken}`)}`;

async function verifyCall(c: TwilioConfig, path: string, params: Record<string, string>, fetcher: typeof fetch) {
  return await fetcher(`https://verify.twilio.com/v2/Services/${encodeURIComponent(c.verifyServiceSid)}/${path}`, {
    method: "POST",
    headers: { Authorization: authHeader(c), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

export async function startVerification(c: TwilioConfig, phone: string, fetcher: typeof fetch = fetch) {
  return (await verifyCall(c, "Verifications", { To: `+${phone}`, Channel: "sms", Locale: "pt-BR" }, fetcher)).ok;
}

export async function checkVerification(c: TwilioConfig, phone: string, code: string, fetcher: typeof fetch = fetch) {
  const response = await verifyCall(c, "VerificationCheck", { To: `+${phone}`, Code: code }, fetcher);
  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return data?.status === "approved";
}

/** Confere se o serviço Verify existe e aceita as credenciais (usado ao conectar em Conexões). */
export async function validateTwilio(c: TwilioConfig, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://verify.twilio.com/v2/Services/${encodeURIComponent(c.verifyServiceSid)}`, { headers: { Authorization: authHeader(c) }, signal: AbortSignal.timeout(10000) });
  return response.ok;
}
