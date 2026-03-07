/**
 * Webhook para WhatsApp Cloud API — Bot de atendimento primário
 *
 * GET: Verificação do Meta (hub.mode, hub.verify_token, hub.challenge).
 * POST: Recebe mensagens. Encaminha para BOT_ATENDIMENTO_WEBHOOK se definido;
 *       senão, se WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID estiverem definidos,
 *       envia resposta de boas-vindas (WHATSAPP_WELCOME_MESSAGE).
 *
 * Secrets: WHATSAPP_VERIFY_TOKEN (obrigatório para GET)
 *          WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID (opcional, para responder)
 *          WHATSAPP_WELCOME_MESSAGE (opcional; se vazio, lê app_config.whatsapp_welcome_message no Supabase)
 *          BOT_ATENDIMENTO_WEBHOOK (opcional, encaminha payload para seu backend)
 *          SUPABASE_SERVICE_ROLE_KEY (opcional, para ler mensagem de boas-vindas do app_config)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_WELCOME = "Olá! Obrigado por falar conosco. Em breve nosso atendimento retorna.";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    return new Uint8Array();
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function computeHmacSha256(secret: string, content: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
  return new Uint8Array(sig);
}

async function getWelcomeFromConfig(supabaseUrl: string, serviceRoleKey: string): Promise<string> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?key=eq.whatsapp_welcome_message&select=value`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) return DEFAULT_WELCOME;
    const data = (await res.json()) as { value: string | null }[];
    const value = data?.[0]?.value?.trim();
    return value || DEFAULT_WELCOME;
  } catch {
    return DEFAULT_WELCOME;
  }
}

function extractIncomingMessages(body: Record<string, unknown>): { to: string }[] {
  const entries = body?.entry as Array<{ changes?: Array<{ value?: { messages?: Array<{ from: string }> } }> }> | undefined;
  if (!Array.isArray(entries)) return [];
  const result: { to: string }[] = [];
  for (const entry of entries) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;
    for (const ch of changes) {
      const value = ch?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const msg of messages) {
        const from = msg?.from;
        if (typeof from === "string") result.push({ to: from });
      }
    }
  }
  return result;
}

async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/\D/g, ""),
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp send error:", res.status, err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  const botWebhookUrl = Deno.env.get("BOT_ATENDIMENTO_WEBHOOK");
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const welcomeMessage = Deno.env.get("WHATSAPP_WELCOME_MESSAGE") || DEFAULT_WELCOME;

  // ── GET: Verificação do webhook (Meta envia hub.mode, hub.verify_token, hub.challenge) ──
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response(JSON.stringify({ error: "Verification failed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── POST: Mensagens e eventos do WhatsApp ──
  if (req.method === "POST") {
    try {
      if (!appSecret) {
        return new Response(JSON.stringify({ error: "WHATSAPP_APP_SECRET não configurado" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const signatureHeader =
        req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");
      if (!signatureHeader?.startsWith("sha256=")) {
        return new Response(JSON.stringify({ error: "Assinatura ausente" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawBody = await req.text();
      const providedSig = hexToBytes(signatureHeader.slice("sha256=".length));
      const computedSig = await computeHmacSha256(appSecret, rawBody);
      if (providedSig.length === 0 || !timingSafeEqual(providedSig, computedSig)) {
        return new Response(JSON.stringify({ error: "Assinatura inválida" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = JSON.parse(rawBody) as Record<string, unknown>;

      // Meta exige resposta 200 rápida; processar em background
      (async () => {
        if (botWebhookUrl && body?.entry) {
          fetch(botWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).catch((err) => console.error("Bot webhook forward error:", err));
        }

        // Se não há backend externo mas temos token e phone id, enviar resposta automática
        if (!botWebhookUrl && accessToken && phoneNumberId) {
          const recipients = extractIncomingMessages(body);
          for (const { to } of recipients) {
            await sendWhatsAppText(phoneNumberId, accessToken, to, welcomeMessage);
          }
        }
      })();

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("WhatsApp webhook POST error:", e);
      return new Response(JSON.stringify({ error: "Bad request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
