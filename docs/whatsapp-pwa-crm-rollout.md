# WhatsApp, pedidos próprios e CRM

## O que está operacional no código

- `manage-operational-integrations`: autenticação real e autorização de administrador por unidade; configuração pública, verificação de secrets sem expor valores e validação do número na Meta.
- `whatsapp-webhook`: verificação GET da Meta; HMAC SHA-256 obrigatório em POST; roteamento pelo Phone Number ID; persistência e deduplicação por message ID; respostas registradas com estado de envio.
- `public-order`: cardápio público, manifest PWA por loja e criação atômica de pedidos para retirada usando preços atuais do banco. A finalização requer token de 60 minutos emitido para uma mensagem WhatsApp assinada. Reenvio usa o mesmo pedido.
- `/pedir/:unit`: cardápio e carrinho; remove o token da URL, utiliza `sessionStorage` por unidade e não transmite referências externas do link.
- `/pedidos-online`: pedidos na cozinha, confirmação de retirada, pagamentos e solicitação de encerramento ao Caixa. Números negativos de sessão identificam retiradas sem ocupar mesas físicas.
- CRM: nome/telefone recebidos da Meta, campos opcionais autorizados, contagem de mensagens separada de visitas, vínculo com pedidos por telefone e CSV protegido contra fórmulas.
- Central de Documentos: links de PWA, WhatsApp Business, webhook e módulos/portais.

Saipos, Consumer, Linx, Colibri, Everest e Sischef foram retirados do catálogo, conforme solicitado.

Os outros serviços do catálogo permitem guardar **pré-configurações públicas**. Isso não implementa seus conectores nem os marca como conectados. Gateways, marketplaces e emissores fiscais dependem do contrato de API, acesso da conta, credenciais e configuração fiscal. A operação atual recebe o pagamento no estabelecimento e registra a conferência manual; uma chave Pix salva não confirma recebimento automaticamente. As exportações de iFood/99Food do PR #44 permanecem disponíveis.

## Publicação

1. Este PR inclui os PRs #43 e #44 ainda não mesclados. Publique o frontend em conjunto com o rollout de Caixa em `docs/cashier-and-documents-rollout.md`: as duas migrations de Caixa devem ser aplicadas em transações separadas, e `close-session` e `manage-user` atualizados. Não ative pedidos online com o frontend antigo.
2. Aplique `20261009123609_whatsapp_pwa_crm.sql` e `20261009130729_harden_operational_function_paths.sql` e publique as três funções acima, incluindo `_shared/operational.ts`. As flags `verify_jwt = false` são intencionais: Meta usa HMAC, pedidos usam token privado; gerenciamento exige `getUser` e a função autorizadora da unidade.
3. A preparação deste backend pode ser publicada antecipadamente porque os padrões de WhatsApp e PWA ficam `NOT_CONNECTED`, e o PWA tem `enabled: false`. A ativação pelo gerenciador exige tanto o fluxo de Caixa instalado como as credenciais Meta e número validado. A migration também invalida o antigo indicador de WhatsApp “conectado”, que anteriormente significava apenas configuração salva.
4. Frontend: configure `VITE_SUPABASE_URL` e a chave **publicável** do projeto. Não coloque tokens da Meta em variáveis `VITE_*`. Garanta fallback de SPA para `/pedir/*` e `/pedidos-online`, HTTPS e publicação de `pwa-icon-192.png` / `pwa-icon-512.png`.

## Meta e links comerciais

No Supabase → Edge Functions → Secrets, configure:

- `WHATSAPP_VERIFY_TOKEN`: token aleatório forte escolhido para a verificação GET.
- `WHATSAPP_APP_SECRET`: App Secret do aplicativo Meta que envia os eventos.
- `WHATSAPP_ACCESS_TOKEN`: token do system user com acesso ao número e permissões WhatsApp adequadas.

Em Conexões, informe por unidade o número comercial completo (país + DDD), **Phone Number ID** (não é o número comercial), a versão Graph habilitada no aplicativo e a mensagem inicial. Não há versão Graph antiga fixa no código.

Webhook:

`https://dtpuvegtcgddjkifsocx.supabase.co/functions/v1/whatsapp-webhook`

Cadastre o mesmo verify token no aplicativo Meta e assine o campo `messages`. Use “Validar Meta e ativar webhook”; só uma mensagem assinada recebida muda o estado de “Meta validada / aguardando webhook” para “Webhook recebendo mensagens”. Não use o sucesso da verificação GET como prova de que a entrega de mensagens está ativa.

Informe o endereço **real** do frontend HTTPS, sem caminho, e habilite PWA depois dos passos acima. O link compartilhável é gerado por unidade:

`https://DOMINIO-PUBLICADO/pedir/UUID-DA-UNIDADE?origem=whatsapp`

Use esse link no perfil, catálogo e respostas rápidas do WhatsApp Business. Para concluir, o cliente envia `PEDIR` ao WhatsApp e recebe um link pessoal válido por 60 minutos. Não coloque tokens pessoais em links públicos de catálogo. Pagamento e retirada ocorrem no estabelecimento; este fluxo não calcula entrega/frete nem cobra cartão/Pix online.

O manifest da loja abre diretamente o cardápio. Dados operacionais e de cliente não são mantidos no cache do service worker; operar pedidos requer conexão.

## CRM e bot

Modos: somente registrar contatos, boas-vindas, coleta opcional para CRM e bot externo.

- `PERFIL SIM` autoriza campos opcionais enviados com `NOME:`, `EMAIL:`, `BAIRRO:` e `PREFERENCIA:`.
- `MARKETING SIM` autoriza ofertas separadamente; uma mensagem recebida ou um pedido não autorizam campanhas.
- `SAIR` revoga as autorizações e interrompe novas atualizações opcionais de perfil.
- O webhook não arquiva automaticamente o texto livre de toda conversa. Em modo externo, persiste o texto do evento encaminhado para rastrear o atendimento; defina retenção adequada ao seu processo. Dados de perfil já fornecidos permanecem para o histórico de atendimento, salvo solicitação de exclusão.

Bot externo: configure `BOT_ATENDIMENTO_WEBHOOK` e `BOT_WEBHOOK_SECRET` no backend. Informe exatamente a mesma URL em Conexões e selecione bot externo. O endereço deve ser HTTPS público; tokens não devem estar na URL. Eventos usam `X-Pop9-Signature: sha256=<HMAC SHA-256 do corpo bruto>` e `X-Pop9-Event-Id`; valide a assinatura e deduplique pelo ID antes de agir. O corpo contém messageId, unitId, contactId, phone, text e type. PEDIR e SAIR são tratados localmente; demais eventos vão para o bot, que precisa de seu próprio conector autorizado para responder pela Meta. Não há promessa de resposta automática por um bot externo ainda não configurado.

Respostas só ocorrem em reação a mensagens recebidas. Campanhas proativas e templates aprovados não fazem parte deste fluxo. Consulte as regras e limites de janela de atendimento da Meta para qualquer automação adicional.

Envios têm timeout e ficam como `sent`, `failed` ou `sending`. Envios incertos não são repetidos automaticamente para evitar duplicação; o CRM alerta sobre essas pendências. Verifique o message ID nos logs do provedor antes de qualquer reenvio supervisionado. Não exponha tabelas internas ou dê permissão de escrita de eventos aos clientes.

## Conferência

As migrations e funções foram testadas localmente sem enviar mensagens a clientes nem registrar pedidos reais. Na conta real, confira depois da configuração:

1. Receber uma mensagem e confirmar o registro no CRM da unidade correta.
2. Reenviar o mesmo webhook em ambiente de teste: uma contagem e uma resposta.
3. Testar PERFIL SIM, campos e SAIR; confirmar permissão separada de ofertas.
4. Abrir o link público, pedir PEDIR pelo WhatsApp e finalizar pelo link pessoal.
5. Ver pedido na cozinha / Pedidos online, confirmar retirada e pagamento, solicitar fechamento e aprovar no Caixa com senha.
6. Conferir links na Central de Documentos e instalação do PWA na rota da loja.

Referências oficiais:

- https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- https://developers.facebook.com/docs/whatsapp/cloud-api/overview
- https://supabase.com/docs/guides/functions/auth-headers
