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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1";

// Modelos permitidos. "chat" = modelos multimodais (Nano Banana), que geram
// imagem pela rota de chat; "images" = modelos só de imagem.
const MODELS: Record<string, { route: "chat" | "images" }> = {
  "google/gemini-3.1-flash-image": { route: "chat" },   // Nano Banana 2
  "openai/gpt-image-2": { route: "images" },            // OpenAI
  "bfl/flux-2-pro": { route: "images" },                // Flux 2 Pro (fotorrealista)
  "bytedance/seedream-5.0-lite": { route: "images" },   // Seedream (mais barato)
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function buildPrompt(name: string, description?: string, ingredients?: string[], extra?: string) {
  const parts = [
    `Fotografia profissional de comida para cardápio de bar/restaurante: "${name}".`,
    description ? `Descrição: ${description}.` : "",
    ingredients?.length ? `Ingredientes visíveis: ${ingredients.join(", ")}.` : "",
    "Prato servido de forma apetitosa, iluminação suave e natural, ângulo de 45 graus,",
    "fundo neutro e desfocado, formato quadrado, alta nitidez.",
    "Sem texto, sem logotipos, sem marcas d'água, sem pessoas.",
    extra ? `Instruções adicionais: ${extra}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

// Converte base64 (ou data URL) em bytes.
function decodeBase64(b64: string): { bytes: Uint8Array; mime: string } {
  let mime = "image/png";
  const match = b64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
  if (match) {
    mime = match[1];
    b64 = match[2];
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function fetchImageBytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem gerada (${res.status})`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mime: res.headers.get("content-type") ?? "image/png",
  };
}

async function generate(model: string, prompt: string, apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  if (MODELS[model].route === "chat") {
    const res = await fetch(`${GATEWAY_URL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["text", "image"],
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`IA (${res.status}): ${await res.text()}`);
    const data = await res.json();
    const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("O modelo não devolveu imagem");
    return url.startsWith("data:") ? decodeBase64(url) : await fetchImageBytes(url);
  }

  const res = await fetch(`${GATEWAY_URL}/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, prompt, n: 1 }),
  });
  if (!res.ok) throw new Error(`IA (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const img = data?.data?.[0];
  if (img?.b64_json) return decodeBase64(img.b64_json);
  if (img?.url) return await fetchImageBytes(img.url);
  throw new Error("O modelo não devolveu imagem");
}

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
    if (!MODELS[model]) return json({ error: `Modelo não permitido: ${model}` }, 400);

    const prompt = buildPrompt(
      name.slice(0, 120),
      typeof description === "string" ? description.slice(0, 500) : undefined,
      Array.isArray(ingredients) ? ingredients.filter((i) => typeof i === "string").slice(0, 20) : undefined,
      typeof extra === "string" ? extra.slice(0, 300) : undefined,
    );

    const { bytes, mime } = await generate(model, prompt, apiKey);
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const path = `ai/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await admin.storage.from("menu-images").upload(path, bytes, { contentType: mime });
    if (upErr) return json({ error: "Erro ao salvar imagem: " + upErr.message }, 500);

    const { data: pub } = admin.storage.from("menu-images").getPublicUrl(path);
    return json({ url: pub.publicUrl, model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
