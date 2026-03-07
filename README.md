# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Conectar ao banco de dados (Supabase)

O app usa o **Supabase** como banco de dados e o SDK oficial (`@supabase/supabase-js`).

1. Crie um projeto em [supabase.com](https://supabase.com) e anote a **URL** e a **anon key** (Project Settings → API).
2. Na raiz do projeto, copie o arquivo de exemplo e preencha com seus dados:
   ```sh
   cp .env.example .env
   ```
3. Edite `.env`:
   - `VITE_SUPABASE_URL` = URL do projeto (ex: `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = anon/public key
4. No código, use o cliente já configurado:
   ```ts
   import { supabase } from "@/integrations/supabase/client";

   // Exemplo: ler uma tabela
   const { data, error } = await supabase.from("nome_da_tabela").select("*");
   ```
5. Reinicie o servidor (`npm run dev`) após alterar o `.env`.

## Status de pedidos, SDK e disparos

No app são atualizados **status de pedidos**, tudo via **SDK** (Supabase), com **disparos** em tempo real (notificações, sons, impressão).

### Status de pedidos (tabelas `orders` e `order_items`)

- **pending** → pedido recebido (cliente enviou).
- **preparing** → cozinha/bar começou a preparar (atualizado pela tela da cozinha).
- **ready** → pedido pronto (disparo de notificação para o atendente).
- **delivered** / **cancelled** → conforme fluxo de entrega/cancelamento.

Todas as mudanças são feitas pelo **SDK** (`supabase.from("orders").update(...)` e `supabase.from("order_items").update(...)`).

### Realtime (atualização automática na tela)

- **useSessionStore**: escuta `sessions`, `session_clients`, `orders` → atualiza mapa de mesas e pedidos do atendente.
- **Kitchen**: escuta `orders` e `order_items` → atualiza fila da cozinha sem recarregar.
- **CloseAccountPanel**: escuta `payments` da sessão → atualiza pagamentos na tela de fechar conta.

### Disparos (o que acontece quando algo muda)

| Evento | Onde | Disparo |
|--------|------|--------|
| Pedido enviado | Cliente | Impressão térmica (comandas cozinha/bar). |
| Status → **ready** | Cozinha | Toast + som no atendente (“Pedido pronto – Mesa X”). |
| Novo pedido na fila | Atendente | Som na tela da cozinha (opcional). |
| Imprimir conta | Atendente / Fechar conta | Impressão térmica + modal na tela (preview). |
| Pagamento registrado | Fechar conta | Realtime atualiza “Já pago” e progresso. |

Resumo: **status** são atualizados no banco via **SDK**; o **Realtime** propaga para as telas; e os **disparos** (toast, som, impressão) são acionados no front com base nesses eventos.

### Impressão: gatilho único (pedido) vs só por comando

- **Comandas (cozinha/bar)**: o gatilho é o **mesmo e simultâneo** com o KDS. Quando o pedido é enviado → grava no banco (KDS atualiza via realtime) e **na mesma ação** dispara a impressão das comandas. Não há outro gatilho para comandas.
- **Conta da mesa, conta individual e outros**: impressão **somente por comando** — quando o usuário clica em "Imprimir Conta da Mesa", "Imprimir" (conta individual), etc. Nada imprime automaticamente.

## API WhatsApp — Bot de atendimento

O app expõe um **webhook** para a **WhatsApp Cloud API** (Meta), para usar como bot de atendimento primário (link da PWA, primeiras mensagens, etc.).

### 1. Edge Function `whatsapp-webhook`

- **GET**: verificação do Meta (parâmetros `hub.mode`, `hub.verify_token`, `hub.challenge`). Responde com o `challenge` em texto puro se o token bater.
- **POST**: recebe mensagens. Se `BOT_ATENDIMENTO_WEBHOOK` estiver definido, encaminha o payload para essa URL. Caso contrário, se `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` estiverem definidos, o próprio webhook envia uma resposta de boas-vindas (`WHATSAPP_WELCOME_MESSAGE`).

URL do webhook (troque pelo seu projeto Supabase):

```text
https://<SEU_PROJETO>.supabase.co/functions/v1/whatsapp-webhook
```

### 2. Secrets da função (Supabase Dashboard)

Em **Project Settings → Edge Functions → Secrets** (ou ao fazer deploy da função), configure:

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `WHATSAPP_VERIFY_TOKEN` | Sim | Token que você define. Deve ser **igual** ao "Token de verificação" no app do Meta. |
| `WHATSAPP_ACCESS_TOKEN` | Não | Token de acesso permanente do Meta (para o bot responder por aqui). |
| `WHATSAPP_PHONE_NUMBER_ID` | Não | ID do número de telefone WhatsApp no app Meta. |
| `WHATSAPP_WELCOME_MESSAGE` | Não | Texto da resposta automática (ex.: "Olá! Em breve retornamos."). Se não definir, usa mensagem padrão. |
| `BOT_ATENDIMENTO_WEBHOOK` | Não | URL do seu backend de bot. Se definida, o webhook só encaminha o payload e **não** envia resposta automática. |

### 3. Configuração no Meta (WhatsApp Cloud API)

1. Em [developers.facebook.com](https://developers.facebook.com), crie ou use um app e adicione o produto **WhatsApp**.
2. Em **WhatsApp → Configuração**, em "Webhook":
   - **URL de retorno de chamada**: `https://<SEU_PROJETO>.supabase.co/functions/v1/whatsapp-webhook`
   - **Token de verificação**: o mesmo valor que você colocou em `WHATSAPP_VERIFY_TOKEN`.
3. Inscreva-se nos eventos que quiser (ex.: **messages**). Após salvar, o Meta envia um GET para validar; a edge function responde com o `challenge` e a verificação passa.

### 4. Responder mensagens

- **Sem backend externo**: Defina `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` nos secrets. O webhook enviará automaticamente a mensagem de boas-vindas (`WHATSAPP_WELCOME_MESSAGE`) a quem mandar mensagem.
- **Com backend externo**: Defina `BOT_ATENDIMENTO_WEBHOOK`. O payload é encaminhado para essa URL; a resposta fica a cargo do seu backend (chamando a API do Meta com seu token).

Payload recebido no POST segue a [estrutura do Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples) (ex.: `entry[].changes[].value.messages`).

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
