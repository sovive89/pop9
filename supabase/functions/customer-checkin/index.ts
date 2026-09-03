// Check-in de cliente via QR Code.
//
// Rota pública (sem Authorization) chamada pela página /m e /m/t/:token.
// Toda escrita em sessions/session_clients/table_qr_codes/checkin_verifications
// passa por aqui com o service role, porque essas tabelas continuam com RLS
// "TO authenticated" (sessions/session_clients) ou sem nenhuma policy
// (table_qr_codes/checkin_verifications) — o cliente anônimo nunca toca
// nelas diretamente pelo SDK.
//
// action="staff_generate_code" é a única exceção: exige Bearer de um
// garçom/admin autenticado (mesmo padrão de supabase/functions/reset-password).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomCode(digits: number) {
  const max = 10 ** digits;
  return String(Math.floor(Math.random() * max)).padStart(digits, "0");
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function requireStaff(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Não autorizado" }, 401) };
  }

  const supabaseAnon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return { error: json({ error: "Token inválido" }, 401) };
  }

  const callerId = claimsData.claims.sub as string;
  const supabaseAdmin = admin();

  const { data: roleCheck } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", callerId)
    .in("role", ["admin", "attendant"])
    .maybeSingle();

  if (!roleCheck) {
    return { error: json({ error: "Apenas garçom/admin pode liberar acesso do cliente" }, 403) };
  }

  return { callerId };
}

async function getTableInfo(body: any) {
  const supabase = admin();
  let tableNumber: number | null = body.table_number ?? null;
  let businessUnitId: string | null = null;

  if (body.token) {
    const { data: qr } = await supabase
      .from("table_qr_codes")
      .select("table_number, business_unit_id, active")
      .eq("token", body.token)
      .maybeSingle();

    if (!qr || !qr.active) {
      return json({ error: "QR Code inválido ou desativado" }, 404);
    }
    tableNumber = qr.table_number;
    businessUnitId = qr.business_unit_id;
  }

  if (!tableNumber) {
    return json({ error: "Número da mesa é obrigatório" }, 400);
  }

  const { data: config } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "customer_checkin_enabled")
    .maybeSingle();

  if (config?.value !== "true") {
    return json({ enabled: false, message: "Check-in pelo cliente está desativado. Chame o garçom." });
  }

  const { data: activeSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("table_number", tableNumber)
    .eq("status", "active")
    .maybeSingle();

  return json({
    enabled: true,
    table_number: tableNumber,
    business_unit_id: businessUnitId,
    has_active_session: !!activeSession,
  });
}

async function staffGenerateCode(req: Request, body: any) {
  const auth = await requireStaff(req);
  if (auth.error) return auth.error;

  const tableNumber = body.table_number;
  if (!tableNumber) return json({ error: "Número da mesa é obrigatório" }, 400);

  const supabase = admin();
  const { data: activeSession } = await supabase
    .from("sessions")
    .select("id")
    .eq("table_number", tableNumber)
    .eq("status", "active")
    .maybeSingle();

  if (!activeSession) {
    return json({ error: "Não há sessão ativa nessa mesa" }, 400);
  }

  const code = randomCode(4);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase.from("checkin_verifications").insert({
    method: "staff_code",
    table_number: tableNumber,
    session_id: activeSession.id,
    code,
    expires_at: expiresAt,
  });

  if (error) return json({ error: "Erro ao gerar código" }, 500);

  return json({ code, expires_at: expiresAt });
}

async function requestCode(body: any) {
  const { method, table_number: tableNumber, phone } = body;
  if (method !== "whatsapp_otp") return json({ error: "Método inválido" }, 400);
  if (!tableNumber) return json({ error: "Número da mesa é obrigatório" }, 400);
  if (!phone) return json({ error: "Telefone é obrigatório" }, 400);

  const supabase = admin();
  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabase.from("checkin_verifications").insert({
    method: "whatsapp_otp",
    table_number: tableNumber,
    phone,
    code,
    expires_at: expiresAt,
  });

  if (error) return json({ error: "Erro ao gerar código" }, 500);

  // Envio real via WhatsApp Cloud API — depende de um access token permanente
  // que ainda não foi configurado (só existe phoneNumberId/webhook hoje, que
  // servem só pra RECEBER mensagens). Sem token, cai no stub.
  const { data: tokenConfig } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "whatsapp_access_token")
    .maybeSingle();

  if (!tokenConfig?.value) {
    return json({
      success: false,
      stub: true,
      message: "WhatsApp não configurado. Peça o código ao garçom.",
    });
  }

  // TODO: enviar via Meta Cloud API quando whatsapp_access_token estiver configurado.
  return json({ success: true });
}

async function verifyCode(body: any) {
  const { method, table_number: tableNumber, code, phone, name } = body;
  if (!method || !tableNumber || !code) {
    return json({ error: "Dados incompletos" }, 400);
  }
  if (method === "whatsapp_otp" && !name) {
    return json({ error: "Nome é obrigatório" }, 400);
  }

  const supabase = admin();

  let query = supabase
    .from("checkin_verifications")
    .select("*")
    .eq("method", method)
    .eq("table_number", tableNumber)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (method === "whatsapp_otp") {
    if (!phone) return json({ error: "Telefone é obrigatório" }, 400);
    query = query.eq("phone", phone);
  }

  const { data: verification } = await query.maybeSingle();

  if (!verification) {
    return json({ error: "Nenhum código pendente para essa mesa" }, 404);
  }

  if (new Date(verification.expires_at) < new Date()) {
    return json({ error: "Código expirado. Peça um novo." }, 400);
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    return json({ error: "Muitas tentativas. Peça um novo código." }, 429);
  }

  if (verification.code !== code) {
    await supabase
      .from("checkin_verifications")
      .update({ attempts: verification.attempts + 1 })
      .eq("id", verification.id);
    return json({ error: "Código incorreto" }, 400);
  }

  await supabase
    .from("checkin_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", verification.id);

  let sessionId = verification.session_id as string | null;

  if (!sessionId) {
    const { data: activeSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("table_number", tableNumber)
      .eq("status", "active")
      .maybeSingle();

    if (activeSession) {
      sessionId = activeSession.id;
    } else {
      const { data: newSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          table_number: tableNumber,
          zone: "salao",
          origin: "customer",
          business_unit_id: verification.business_unit_id,
        })
        .select()
        .single();

      if (sessionError || !newSession) {
        return json({ error: "Erro ao abrir sessão" }, 500);
      }
      sessionId = newSession.id;
    }
  }

  const { data: client, error: clientError } = await supabase
    .from("session_clients")
    .insert({
      session_id: sessionId,
      name: name ?? "Cliente",
      phone: phone ?? null,
    })
    .select()
    .single();

  if (clientError || !client) {
    return json({ error: "Erro ao registrar cliente" }, 500);
  }

  return json({ success: true, session_id: sessionId, client_id: client.id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "get_table_info":
        return await getTableInfo(body);
      case "staff_generate_code":
        return await staffGenerateCode(req, body);
      case "request_code":
        return await requestCode(body);
      case "verify_code":
        return await verifyCode(body);
      default:
        return json({ error: "Ação desconhecida" }, 400);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
