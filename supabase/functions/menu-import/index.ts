import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';
import { json, cors, uuid } from '../_shared/operational.ts';
import { CHAT_MODELS } from '../_shared/assistant-help.ts';
import { decryptAIKey, documentCompletion, parseModelJson } from '../_shared/ai-text.ts';
import { sanitizeDraft, findUnitConflicts, EXTRACTION_SYSTEM } from '../_shared/menu-import-schema.ts';

// Lê arquivos de cardápio/fichas técnicas enviados pelo admin (bucket privado menu-imports)
// e devolve um RASCUNHO validado. Esta função NÃO grava cardápio nem estoque: a gravação é
// feita depois, pela RPC apply_menu_import, a partir do rascunho revisado pelo admin.

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 60000;
const EXT: Record<string, { kind: 'pdf' | 'image' | 'sheet' | 'text'; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' }, png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' }, webp: { kind: 'image', mime: 'image/webp' },
  xlsx: { kind: 'sheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { kind: 'text', mime: 'text/csv' }, txt: { kind: 'text', mime: 'text/plain' },
};

function toBase64(bytes: Uint8Array) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  let admin: ReturnType<typeof createClient> | undefined; let requestId: string | undefined; let reserved = false;
  let paths: string[] = [];
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);
    admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: 'Não autenticado' }, 401);
    const raw = await req.text(); if (raw.length > 80000) return json({ error: 'Solicitação muito grande' }, 413);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Dados inválidos' }, 400); }
    const unit = body.businessUnitId; if (!uuid(unit)) return json({ error: 'Unidade inválida' }, 400);
    const { data: roles, error: roleError } = await admin.from('user_roles').select('business_unit_id').eq('user_id', user.id).eq('role', 'admin');
    if (roleError) throw Error('Não foi possível verificar o acesso.');
    if (!roles?.some((r: { business_unit_id: string | null }) => r.business_unit_id === null || r.business_unit_id === unit)) return json({ error: 'Importação disponível somente ao administrador desta unidade' }, 403);
    const { data: business, error: businessError } = await admin.from('business_units').select('id,name').eq('id', unit).eq('active', true).maybeSingle();
    if (businessError) throw Error('Não foi possível consultar a unidade.'); if (!business) return json({ error: 'Unidade indisponível' }, 404);
    if (body.action !== 'extract') return json({ error: 'Ação inválida' }, 400);

    const files = Array.isArray(body.files) ? body.files : [];
    const pastedText = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
    if (files.length > MAX_FILES) return json({ error: `Envie no máximo ${MAX_FILES} arquivos por vez.` }, 400);
    const pathPattern = new RegExp(`^${unit}/[0-9a-f-]{36}\\.(pdf|png|jpe?g|webp|xlsx|csv|txt)$`);
    for (const file of files) {
      if (typeof file !== 'string' || !pathPattern.test(file)) return json({ error: 'Arquivo inválido para esta unidade' }, 400);
    }
    paths = files as string[];
    if (!paths.length && !pastedText.trim()) return json({ error: 'Anexe um arquivo ou cole o texto do cardápio.' }, 400);

    const model = CHAT_MODELS.find(m => m.id === body.model); if (!model) return json({ error: 'Selecione um modelo de IA disponível' }, 400);
    const { data: credential, error: credentialError } = await admin.from('ai_provider_credentials').select('provider,encrypted_key,iv').eq('business_unit_id', unit).eq('provider', model.provider).eq('status', 'connected').maybeSingle();
    if (credentialError) throw Error('Não foi possível verificar a configuração da IA.');
    if (!credential) return json({ error: 'Conecte a IA em Conexões desta unidade' }, 409);
    if (!uuid(body.requestId)) return json({ error: 'Solicitação inválida' }, 400); requestId = body.requestId;
    const { error: reserveError } = await admin.rpc('reserve_assistant_request', { p_id: requestId, p_unit: unit, p_user: user.id, p_action: 'document', p_model: model.id });
    if (reserveError) return json({ error: reserveError.message.includes('Limite') ? 'Limite de IA da unidade atingido. Tente novamente mais tarde.' : 'Não foi possível iniciar a leitura. Tente novamente.' }, 429);
    reserved = true;

    const attachments: { kind: 'pdf' | 'image'; mime: string; data: string; name: string }[] = [];
    const texts: string[] = []; let total = 0;
    for (const [index, path] of paths.entries()) {
      const ext = path.split('.').pop()!.toLowerCase(); const type = EXT[ext];
      const { data: blob, error } = await admin.storage.from('menu-imports').download(path);
      if (error || !blob) throw Error(`Não foi possível ler o arquivo ${index + 1}.`);
      if (blob.size > MAX_FILE_BYTES) throw Error(`O arquivo ${index + 1} passa de 10 MB.`);
      total += blob.size; if (total > MAX_TOTAL_BYTES) throw Error('Os arquivos somam mais de 20 MB. Envie em partes.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (type.kind === 'pdf' || type.kind === 'image') attachments.push({ kind: type.kind, mime: type.mime, data: toBase64(bytes), name: `arquivo-${index + 1}.${ext}` });
      else if (type.kind === 'sheet') {
        const book = XLSX.read(bytes, { type: 'array' });
        const csv = book.SheetNames.slice(0, 10).map((name: string) => `# Planilha ${name}\n` + XLSX.utils.sheet_to_csv(book.Sheets[name])).join('\n');
        texts.push(`--- Arquivo ${index + 1} (planilha) ---\n${csv.slice(0, MAX_TEXT)}`);
      } else texts.push(`--- Arquivo ${index + 1} (texto) ---\n${new TextDecoder().decode(bytes).slice(0, MAX_TEXT)}`);
    }
    if (pastedText.trim()) texts.push(`--- Texto colado pelo administrador ---\n${pastedText}`);
    const userText = `Unidade: ${business.name}. Extraia o cardápio e as fichas técnicas dos arquivos anexados e do conteúdo abaixo.\n` +
      (texts.length ? `<conteudo>\n${texts.join('\n\n').slice(0, MAX_TEXT * 2)}\n</conteudo>` : '');

    const result = await documentCompletion(model.provider, model.model, await decryptAIKey(credential.encrypted_key, credential.iv), EXTRACTION_SYSTEM, userText, attachments);
    const { draft, warnings } = sanitizeDraft(parseModelJson(result.text));
    const { data: materials, error: materialsError } = await admin.from('raw_materials').select('name,unit').eq('business_unit_id', unit).limit(5000);
    if (materialsError) throw Error('Não foi possível conferir os insumos já cadastrados.');
    const conflicts = findUnitConflicts(draft, materials ?? []);
    // Unidades já cadastradas dos insumos citados no rascunho, para o modo guiado converter com segurança.
    const cited = new Set(draft.items.flatMap(i => i.recipe.flatMap(l => [l.material, ...(l.preparation?.inputs ?? []).map(b => b.material)])).map(n => n.toLowerCase()));
    const knownUnits = Object.fromEntries((materials ?? []).filter((m: { name: string }) => cited.has(m.name.trim().toLowerCase())).map((m: { name: string; unit: string }) => [m.name.trim().toLowerCase(), m.unit.trim().toLowerCase()]));
    await admin.from('ai_assistant_usage').update({ status: 'completed', completed_at: new Date().toISOString(), input_tokens: result.inputTokens, output_tokens: result.outputTokens }).eq('id', requestId);
    return json({ draft, warnings, conflicts, knownUnits, model: model.id });
  } catch (e) {
    if (reserved && admin && requestId) await admin.from('ai_assistant_usage').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', requestId);
    return json({ error: e instanceof Error ? e.message : 'Falha ao ler os arquivos' }, 503);
  } finally {
    // Os arquivos só servem para esta leitura: removidos sempre, com ou sem sucesso.
    if (admin && paths.length) await admin.storage.from('menu-imports').remove(paths).catch(() => undefined);
  }
});
