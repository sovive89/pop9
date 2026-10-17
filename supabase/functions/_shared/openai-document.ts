import { createOCRResponsesRequest, extractOCRResponseText } from './ocr-responses.ts';
import type { ModelAttachment } from './document-attachment.ts';

/** Responses para cardápios/catálogos: mantém o contrato próprio do ERP. */
export async function openAIDocumentCompletion(model: string, key: string, system: string, userText: string, attachments: ModelAttachment[], fetcher: typeof fetch = fetch) {
  const models = model === 'gpt-6-astra' ? [model, 'gpt-5.6-luna'] : [model];
  for (const [index, candidate] of models.entries()) {
    const template = createOCRResponsesRequest({ endpoint: 'https://api.openai.com/v1/responses', model: candidate, prompt: system, data: { base64: '', mimeType: 'image/jpeg' } });
    const content = [
      { type: 'input_text', text: system + '\n\n' + userText },
      ...attachments.map(a => a.kind === 'pdf' ? { type: 'input_file', filename: a.name, file_data: `data:${a.mime};base64,${a.data}` } : { type: 'input_image', image_url: `data:${a.mime};base64,${a.data}`, detail: ['gpt-6-astra', 'gpt-5.6-luna'].includes(candidate) ? 'original' : 'high' }),
    ];
    try {
      const response = await fetcher('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ ...template, input: [{ role: 'user', content }], text: { format: { type: 'json_object' } }, max_output_tokens: 16384 }), signal: AbortSignal.timeout(60000), redirect: 'error' });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const quota = ['insufficient_quota', 'billing_hard_limit_reached'].includes(error?.error?.code);
        if (!quota && index < models.length - 1 && (response.status === 408 || response.status === 429 || response.status >= 500)) continue;
        const failure = new Error(quota ? 'A conta da OpenAI está sem créditos ou atingiu o limite de uso.' : response.status === 401 || response.status === 403 ? 'A credencial da OpenAI foi recusada. Confira Conexões desta unidade.' : `OpenAI respondeu HTTP ${response.status}. Confira o modelo e as permissões da conta.`);
        Object.assign(failure, { retryable: false });
        throw failure;
      }
      const payload = await response.json();
      const output = extractOCRResponseText(payload);
      if (output.refused) { const failure = new Error('A IA não pôde analisar o documento.'); Object.assign(failure, { retryable: false }); throw failure; }
      if (output.incomplete || !output.text) throw Error('A leitura ficou incompleta. Tente um documento menor.');
      const parsed = JSON.parse(output.text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('A IA retornou um rascunho inválido.');
      return { text: output.text, inputTokens: payload.usage?.input_tokens ?? null, outputTokens: payload.usage?.output_tokens ?? null };
    } catch (error) {
      if ((error as { retryable?: boolean }).retryable === false || index === models.length - 1) throw error;
    }
  }
  throw Error('Não foi possível ler o documento.');
}
