# Revisão da central de Conexões

## Achados antes das alterações

- Saipos, Consumer, Linx/Links, Colibri, Everest e Sua Chef já não constam no catálogo atual.
- A galeria mistura opções de operação de restaurante, ERPs externos, e-commerce e superfícies genéricas de API, mesmo sem provedores implementados.
- OpenAI, Gemini, Anthropic e Grok aparecem tanto no catálogo genérico (não implementado) quanto no painel de credenciais de IA, que utiliza outro backend e armazenamento cifrado. O status dos cards genéricos não representa esse painel.
- FLUX e Ideogram aparecem como opções no painel de credenciais, mas o backend explicitamente recusa sua ativação por não ter validação segura de credenciais.
- WhatsApp, bot, webhook Meta e PWA de pedidos próprios já são configurados no painel dedicado, fora da galeria. O webhook do bot não depende do card genérico “Webhook”.

## Escopo

Consolidar configurações duplicadas de IA no painel próprio. A revisão do catálogo não apaga registros de integração nem credenciais de nenhuma unidade, não desconecta serviços e não modifica webhooks ou emissão/pagamentos. As integrações mantidas que ainda dependem de desenvolvimento continuam identificadas como indisponíveis para conexão real.

A galeria mantém iFood, 99Food, Mercado Pago, Stone, Cielo, Rede, PagBank, Asaas, Pix, Focus NFe e Nuvem Fiscal. O painel de IA mantém OpenAI, Google, xAI e Anthropic. WhatsApp, webhook Meta, bot externo e PWA de pedidos continuam no painel dedicado.

Retirados da galeria: Rappi, Aiqfome, Instagram, Telegram, Goomer, Omie, Bling, Conta Azul, Shopify, WooCommerce, Mercado Livre, Shopee, Webhook genérico, REST API genérica, GraphQL e HTTP genérico, além dos cards duplicados de IA. As opções de ativação FLUX e Ideogram saem do seletor do painel de IA, sem alterar o backend ou apagar credenciais legadas.

Os filtros de categoria passam a ser derivados das entradas restantes. O filtro de tipo é retirado porque todas as opções da galeria agora são operacionais. Categorias/contratos compartilhados continuam disponíveis para registros existentes.

## Validação

Em 10/10/2026: 167 testes existentes passaram em 33 arquivos; TypeScript e build passaram; lint sem erros e com 11 avisos preexistentes. O catálogo carregado foi verificado: 12 definições, 11 cards na galeria, três categorias (delivery, pagamentos, fiscal). Conectores sem provedor continuam não implementados. Não foram executadas gravações no Supabase nem validações com APIs externas; esta alteração organiza o catálogo no frontend.
