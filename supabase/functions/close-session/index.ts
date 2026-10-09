import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return respond(405, { error: "Método não permitido" });
  const bearer = req.headers.get("Authorization");
  if (!bearer?.startsWith("Bearer ")) return respond(401, { error: "Faça login novamente" });
  try {
    const body = await req.json();
    if (typeof body.session_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.session_id) ||
      typeof body.password !== "string" || !body.password || body.password.length > 1024 ||
      (body.justification != null && (typeof body.justification !== "string" || body.justification.length > 1000))) {
      return respond(400, { error: "Informe a sessão, sua senha e uma justificativa válida" });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(bearer.slice(7));
    if (authError || !user?.email) return respond(401, { error: "Faça login novamente" });

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: tableSession, error: sessionError } = await admin.from("sessions")
      .select("business_unit_id").eq("id", body.session_id).maybeSingle();
    if (sessionError || !tableSession) return respond(404, { error: "Sessão não encontrada" });
    const { data: roles, error: roleError } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id).eq("business_unit_id", tableSession.business_unit_id).in("role", ["admin", "cashier"]);
    if (roleError || !roles?.length) return respond(403, { error: "Apenas Caixa ou Administrador da unidade pode encerrar" });

    // Reauthenticate on a separate client so the service role is never replaced
    // and the browser's existing login is unaffected.
    const { data: proof, error: passwordError } = await authClient.auth.signInWithPassword({ email: user.email, password: body.password });
    if (passwordError || proof.user?.id !== user.id) return respond(403, { error: "Senha incorreta" });
    try {
      const { data, error } = await admin.rpc("approve_session_closure", {
        p_session_id: body.session_id, p_actor_id: user.id, p_justification: body.justification ?? null,
      });
      if (error) return respond(error.code === "42501" ? 403 : 409, { error: error.message });
      return respond(200, { ...data });
    } finally {
      await authClient.auth.signOut({ scope: "local" });
    }
  } catch {
    return respond(500, { error: "Não foi possível confirmar o encerramento" });
  }
});
