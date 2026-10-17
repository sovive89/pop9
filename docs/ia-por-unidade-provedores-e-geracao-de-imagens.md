# Pop9 — Integrações de IA por unidade e geração de imagens

## Decisão confirmada
Cada estabelecimento configura suas próprias credenciais de IA em **Administração > Conexões > Inteligência Artificial**. Não compartilhar chaves entre tenants. A conta do estabelecimento assume os custos da API do respectivo provedor.

## Provedores
- OpenAI: GPT Image para imagens; modelos de texto conforme disponibilidade.
- Google: Gemini / Nano Banana e Imagen para imagens, sujeitos à API/modelo habilitado.
- xAI: Grok Imagine para imagens, se disponível na API.
- Black Forest Labs: FLUX para imagens.
- Ideogram: geração de imagens, se integração/API disponível.
- Anthropic: Claude para texto, análise e preparação de prompts; **não listar como gerador nativo de imagens** sem API de geração compatível.

## Experiência do administrador
1. Selecionar provedor, informar credencial e testar conexão no backend.
2. Salvar segredo cifrado em cofre server-side com escopo `business_unit_id`, acesso autorizado por unidade, sem retornar chave ao cliente.
3. Exibir status real: não configurado, validando, conectado ou erro; nunca marcar conectado sem validação.
4. No editor do cardápio, mostrar modelos de imagem realmente suportados/habilitados, com provedor, custo estimado quando conhecido, e botão Gerar.
5. Selecionar modelo e gerar imagem no backend usando **somente** credencial da unidade autenticada; verificar autorização por tenant, limites e mensagens de erro.
6. Salvar imagem no armazenamento da unidade e vincular ao item; permitir prévia e confirmação antes de publicar.

## Segurança e faturamento
- Não aceitar chaves em chat, logs, frontend persistente ou tabelas públicas.
- Criptografar credenciais e implementar rotação, revogação e auditoria.
- Preferir teste real de autenticação/permissão, não apenas checar formato da chave.
- Cada provedor tem cobrança e requisitos próprios; não prometer que uma chave OpenAI serve para outros provedores.
- Disponibilidade e nomes de modelos devem ser confirmados na API e atualizados no catálogo.

## Situação atual
A função `generate-menu-image` usa `AI_GATEWAY_API_KEY` global. A experiência por unidade, cofre, validação de credenciais, roteamento de modelos e testes end-to-end **ainda precisam ser implementados**. Não tratar este documento como implementação concluída.
