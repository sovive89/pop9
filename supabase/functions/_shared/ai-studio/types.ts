// AI Studio do Pop9 ERP — contratos (interfaces) dos provedores de IA.
//
// Hierarquia conceitual:
//
//   AIProvider
//    ├─ ImageGenerationProvider   ← único implementado hoje (fotos do cardápio)
//    ├─ TextGenerationProvider    ← ainda não existe no ERP (não implementado)
//    └─ ImageEditingProvider      ← ainda não existe no ERP (não implementado)
//
// Só o que já existe foi escrito. Os outros dois entram quando houver um uso real.
//
// Este código roda dentro de Edge Functions (Deno) e também é importado pelos
// testes (Node). Por isso usa apenas APIs padrão de web (fetch, AbortSignal,
// atob) e nenhum import externo.

/** Todo provedor de IA tem um identificador estável (ex.: "vercel-ai-gateway"). */
export interface AIProvider {
  readonly id: string;
}

/** Imagem já validada (tipo e tamanho conferidos). */
export interface GeneratedImage {
  bytes: Uint8Array;
  mime: string;
}

export interface ImageGenerationRequest {
  /** Identificador do modelo, ex.: "openai/gpt-image-2". Precisa estar em IMAGE_MODELS. */
  model: string;
  /** Regras fixas (nunca vêm do usuário): estilo da foto, proibições etc. */
  instructions: string;
  /** Dados do assunto da imagem (texto livre, já saneado/entre aspas). */
  subject: string;
}

export interface ImageGenerationProvider extends AIProvider {
  generateImage(request: ImageGenerationRequest): Promise<GeneratedImage>;
}
