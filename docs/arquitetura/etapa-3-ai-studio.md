# Etapa 3 — AI Studio do ERP

Extração da lógica de geração de imagem da Edge Function `generate-menu-image` para um provedor isolado. **Sem mudança de comportamento nem do contrato HTTP.**

## Onde fica

| Pasta | Papel |
|---|---|
| `supabase/functions/_shared/ai-studio/` | Provedores e regras (rodam no servidor, em Deno) |
| `src/ai-studio/` | Lado do navegador: catálogo de modelos da tela e tipos do contrato HTTP |

Por que duas pastas: a função usa o segredo `AI_GATEWAY_API_KEY` e o runtime Deno das Edge Functions não importa código de `src/`. O teste `src/test/aiStudio.test.ts` garante que os dois catálogos de modelos são idênticos.

## Hierarquia

`AIProvider` → `ImageGenerationProvider` (implementado: `VercelGatewayImageProvider`). `TextGenerationProvider` e `ImageEditingProvider` **não existem no ERP hoje e não foram criados**.

## Arquivos de `_shared/ai-studio`

- `types.ts` — interfaces (`AIProvider`, `ImageGenerationProvider`, `ImageGenerationRequest`, `GeneratedImage`).
- `models.ts` — lista fixa de modelos e rota (`chat` ou `images`).
- `imageBytes.ts` — validação da imagem (tipos, 15 MB), base64, download com timeout de 30 s.
- `vercelGatewayImageProvider.ts` — chamada ao Vercel AI Gateway (timeout de 90 s).
- `menuImagePrompt.ts` — regras fixas da foto e montagem dos dados do item (regra do cardápio, fora do provedor).

A função `generate-menu-image/index.ts` ficou só com HTTP: CORS, autenticação, papel admin, validação do corpo, upload no bucket `menu-images` e resposta `{ url, model }`.

## Única diferença de comportamento

A validação do modelo passou de `!MODELS[model]` para `hasOwnProperty`. Antes, um `model` como `"constructor"` passava pela checagem e só falhava no gateway; agora recebe `400 Modelo não permitido` na hora. Modelos válidos e a resposta de sucesso não mudam.

## Deploy

As Edge Functions agora dependem de `_shared/`. O deploy pela CLI (`supabase functions deploy generate-menu-image`) inclui a pasta. **Redeploy da função é necessário** para a produção usar o novo código; não foi feito nesta etapa.

## Verificação

`npm run test` (29 testes, 13 novos), `npm run build` OK, `tsc` 10 erros antigos (sem aumento), lint 37 erros (sem aumento). Deno não está disponível neste ambiente, então a função foi validada por bundling com esbuild e pelos testes do provedor com `fetch` simulado, não por execução real contra o gateway.
