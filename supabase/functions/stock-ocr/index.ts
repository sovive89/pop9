import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.2';
import { json, cors, uuid } from '../_shared/operational.ts';
import { decryptAIKey } from '../_shared/ai-text.ts';
import { requestOCR } from '../_shared/ocr-request.ts';
import { DEFAULT_OCR_MODEL, DEFAULT_OCR_FALLBACK_MODEL } from '../_shared/ocr-model.ts';
import { normalizeOCRPayload } from '../_shared/ocr-contract.ts';
import { normalizeProductPhoto, PRODUCT_PHOTO_PROMPT } from '../_shared/stock-photo.ts';
import { STOCK_DOCUMENT_PROMPT } from '../_shared/stock-ocr-prompt.ts';

// Somente extração. A entrada continua passando pela conferência e pela RPC de compras.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  let admin: ReturnType<typeof createClient> | undefined;
  let requestId: string | undefined;
  let reserved = false;
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);
    admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(authorization.slice(7));
    if (authError || !user) return json({ error: 'Não autenticado' }, 401);
    const raw = await req.text();
    if (raw.length > 4 * 1024 * 1024 + 2000) return json({ error: 'Envie um arquivo de até 3 MB.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Dados inválidos' }, 400); }
    const unit = body.businessUnitId;
    if (!uuid(unit) || !uuid(body.requestId)) return json({ error: 'Unidade ou solicitação inválida' }, 400);
    const { data: roles, error: roleError } = await admin.from('user_roles').select('business_unit_id').eq('user_id', user.id).eq('role', 'admin');
    if (roleError) throw Error('Não foi possível verificar o acesso.');
    if (!roles?.some(r => r.business_unit_id === null || r.business_unit_id === unit)) return json({ error: 'OCR disponível somente ao administrador desta unidade' }, 403);
    const { data: business, error: businessError } = await admin.from('business_units').select('id').eq('id', unit).eq('active', true).maybeSingle();
    if (businessError) throw Error('Não foi possível consultar a unidade.');
    if (!business) return json({ error: 'Unidade indisponível' }, 404);
    if (!['documento', 'produtos'].includes(body.mode) || typeof body.base64 !== 'string' || !body.base64.length || body.base64.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64) || !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(body.mimeType) || (body.mode === 'produtos' && body.mimeType === 'application/pdf')) return json({ error: 'Envie uma foto JPEG, PNG, WebP ou um PDF de nota de até 3 MB.' }, 400);
    const { data: credential, error: credentialError } = await admin.from('ai_provider_credentials').select('encrypted_key,iv').eq('business_unit_id', unit).eq('provider', 'openai').eq('status', 'connected').maybeSingle();
    if (credentialError) throw Error('Não foi possível verificar a configuração da IA.');
    if (!credential) return json({ error: 'Conecte a OpenAI em Conexões desta unidade.' }, 409);
    requestId = body.requestId;
    const { error: reserveError } = await admin.rpc('reserve_assistant_request', { p_id: requestId, p_unit: unit, p_user: user.id, p_action: 'document', p_model: DEFAULT_OCR_MODEL });
    if (reserveError) return json({ error: 'Não foi possível reservar a leitura. Confira os limites de IA da unidade.' }, 429);
    reserved = true;
    const result = await requestOCR({ endpoint: 'https://api.openai.com/v1/responses', apiKey: await decryptAIKey(credential.encrypted_key, credential.iv), model: DEFAULT_OCR_MODEL, fallbackModel: DEFAULT_OCR_FALLBACK_MODEL, prompt: body.mode === 'produtos' ? PRODUCT_PHOTO_PROMPT : STOCK_DOCUMENT_PROMPT, data: { base64: body.base64, mimeType: body.mimeType, fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 160) : 'documento' } });
    const draft = body.mode === 'produtos' ? normalizeProductPhoto(result) : normalizeOCRPayload(result);
    await admin.from('ai_assistant_usage').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', requestId);
    return json({ draft, mode: body.mode });
  } catch (error) {
    if (reserved && admin && requestId) await admin.from('ai_assistant_usage').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', requestId);
    return json({ error: error instanceof Error ? error.message : 'Não foi possível ler o documento.' }, 503);
  }
});
