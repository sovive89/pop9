// Gera a foto de um item do cardápio com IA, via Vercel AI Gateway.
//
// Por que uma Edge Function? A chave da API (AI_GATEWAY_API_KEY) é um segredo:
// se ficasse no front-end, qualquer pessoa poderia copiá-la pelo navegador e
// gastar seus créditos. Aqui ela fica só no servidor (Supabase Secrets).
//
// Fluxo: front manda { name, description, ingredients, model } →
// função monta o prompt → chama o modelo → salva a imagem no bucket
// "menu-images" → devolve a URL pública.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// A lógica de IA (modelos, prompt, chamada ao gateway, validação da imagem) vive
// no AI Studio, compartilhado entre funções. Esta função cuida só do HTTP:
// autenticação, permissão, validação do corpo e gravação no Storage.
import {
  DownloadTimeoutError,
  isAllowedImageModel,
  PHOTO_RULES,
  VercelGatewayImageProvider,
  buildMenuItemSubject,
} from "../_shared/ai-studio/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
    if (!apiKey) return json({ error: "AI_GATEWAY_API_KEY não configurada nos secrets do Supabase" }, 500);

    // Só admin pode gerar (cada geração custa dinheiro).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: role } = await admin
      .from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Sem permissão de admin" }, 403);

    const { name, description, ingredients, model, extra } = await req.json();
    if (!name || typeof name !== "string") return json({ error: "Informe o nome do item" }, 400);
    if (!isAllowedImageModel(model)) return json({ error: `Modelo não permitido: ${model}` }, 400);

    const subject = buildMenuItemSubject({ name, description, ingredients, extra });

    const { bytes, mime } = await new VercelGatewayImageProvider(apiKey).generateImage({
      model,
      instructions: PHOTO_RULES,
      subject,
    });
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const path = `ai/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await admin.storage.from("menu-images").upload(path, bytes, { contentType: mime });
    if (upErr) return json({ error: "Erro ao salvar imagem: " + upErr.message }, 500);

    const { data: pub } = admin.storage.from("menu-images").getPublicUrl(path);
    return json({ url: pub.publicUrl, model });
  } catch (e) {
    if (e instanceof DownloadTimeoutError) return json({ error: e.message }, 504);
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return json({ error: "A IA demorou demais para responder. Tente de novo ou escolha outro modelo." }, 504);
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
