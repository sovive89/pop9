// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, it, expect, vi } from 'vitest';
import { requestOCR } from '../../supabase/functions/_shared/ocr-request';
import { openAIDocumentCompletion } from '../../supabase/functions/_shared/openai-document';
import { normalizeProductPhoto } from '../../supabase/functions/_shared/stock-photo';
import { normalizeOCRPayload } from '../../supabase/functions/_shared/ocr-contract';
import { json, cors, uuid } from '../../supabase/functions/_shared/operational';

const response = (text: string) => new Response(JSON.stringify({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 4, output_tokens: 8 } }));
const params = { endpoint: 'https://api.openai.com/v1/responses', apiKey: 'test-placeholder', model: 'openai/gpt-6-astra', fallbackModel: 'openai/gpt-5.6-luna', prompt: 'Retorne JSON', data: { base64: 'eA==', mimeType: 'image/jpeg' } };

describe('OCR portado do Fast Bar', () => {
  it('sends vision and strict stock JSON through Responses without temperature', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"itens":[]}'));
    await requestOCR({ ...params, fetcher });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-6-astra'); expect(body.temperature).toBeUndefined();
    expect(body.input[0].content[1]).toMatchObject({ type: 'input_image', detail: 'original' });
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.store).toBe(false);
  });
  it('retries a transient failure once with Luna', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(response('{"itens":[]}'));
    await requestOCR({ ...params, fetcher });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe('gpt-5.6-luna');
  });
  it('does not retry a rejected key or depleted credits', async () => {
    for (const [status, body] of [[401, '{}'], [429, '{"error":{"code":"insufficient_quota"}}']] as const) {
      const fetcher = vi.fn().mockResolvedValue(new Response(body, { status }));
      await expect(requestOCR({ ...params, fetcher })).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('keeps catalog JSON separate from stock schema, including PDFs and token usage', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('{"items":[]}'));
    const result = await openAIDocumentCompletion('gpt-6-astra', 'test-placeholder', 'JSON', 'cardapio', [{ kind: 'pdf', name: 'menu.pdf', mime: 'application/pdf', data: 'eA==' }], fetcher);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.text.format.type).toBe('json_object'); expect(body.input[0].content[1].type).toBe('input_file');
    expect(result).toMatchObject({ inputTokens: 4, outputTokens: 8 });
  });
  it('catalog invalid JSON falls back and a refusal stops', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response('invalid')).mockResolvedValueOnce(response('{"items":[]}'));
    await openAIDocumentCompletion('gpt-6-astra', 'test', 'JSON', '', [], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const refusal = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'no' }] }] })));
    await expect(openAIDocumentCompletion('gpt-6-astra', 'test', 'JSON', '', [], refusal)).rejects.toThrow(); expect(refusal).toHaveBeenCalledTimes(1);
  });
});

const unit = '11111111-1111-4111-8111-111111111111';
function endpoint(options: { auth?: boolean; roleUnit?: string; credential?: boolean } = {}) {
  const calls: string[] = []; const ocr = vi.fn().mockResolvedValue({ itens: [{ descricao: 'Caixa fechada', quantidade: 1, unidade: 'CX' }] });
  const db = { auth: { getUser: async () => ({ data: { user: options.auth === false ? null : { id: 'admin' } }, error: null }) }, rpc: vi.fn().mockResolvedValue({ error: null }), from(table: string) {
    calls.push(table);
    const result = () => ({ data: table === 'user_roles' ? [{ business_unit_id: options.roleUnit ?? unit }] : table === 'business_units' ? { id: unit } : table === 'ai_provider_credentials' ? options.credential === false ? null : { encrypted_key: 'encrypted', iv: 'iv' } : null, error: null });
    const q = { select: () => q, eq: () => q, update: () => q, maybeSingle: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) }; return q;
  } };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync('supabase/functions/stock-ocr/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('createClient', 'Deno', 'json', 'cors', 'uuid', 'decryptAIKey', 'requestOCR', 'DEFAULT_OCR_MODEL', 'DEFAULT_OCR_FALLBACK_MODEL', 'normalizeOCRPayload', 'normalizeProductPhoto', 'PRODUCT_PHOTO_PROMPT', 'STOCK_DOCUMENT_PROMPT', code)(() => db, { env: { get: () => 'test' }, serve: (fn: typeof handler) => { handler = fn; } }, json, cors, uuid, async () => 'test-placeholder', ocr, params.model, params.fallbackModel, normalizeOCRPayload, normalizeProductPhoto, 'produtos', 'documento');
  return { calls, ocr, db, post: (patch: Record<string, unknown> = {}) => handler(new Request('https://example.test/ocr', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ businessUnitId: unit, requestId: crypto.randomUUID(), mode: 'produtos', mimeType: 'image/jpeg', base64: 'eA==', ...patch }) })) };
}
describe('stock OCR boundary', () => {
  it('authorizes the unit, uses its vault and returns a draft without stock writes', async () => {
    const api = endpoint(); const result = await api.post(); expect(result.status).toBe(200);
    expect((await result.json()).draft.itens[0]).toMatchObject({ descricao: 'Caixa fechada', quantidade: 1, unidade: 'CX', valorUnitario: null });
    expect(api.calls.every(table => ['user_roles', 'business_units', 'ai_provider_credentials', 'ai_assistant_usage'].includes(table))).toBe(true);
    expect(api.db.rpc).toHaveBeenCalledWith('reserve_assistant_request', expect.any(Object));
  });
  it('rejects authentication and another unit before decrypting or invoking OCR', async () => {
    const anonymous = endpoint({ auth: false }); expect((await anonymous.post()).status).toBe(401); expect(anonymous.ocr).not.toHaveBeenCalled();
    const other = endpoint({ roleUnit: '22222222-2222-4222-8222-222222222222' }); expect((await other.post()).status).toBe(403); expect(other.ocr).not.toHaveBeenCalled();
  });
  it('requires the unit credential and rejects PDFs in product-photo mode', async () => {
    const missing = endpoint({ credential: false }); expect((await missing.post()).status).toBe(409); expect(missing.ocr).not.toHaveBeenCalled();
    const api = endpoint(); expect((await api.post({ mimeType: 'application/pdf' })).status).toBe(400); expect(api.ocr).not.toHaveBeenCalled();
  });
});
