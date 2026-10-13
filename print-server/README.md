# POP9 Print Server

Programa pequeno que fica ligado num computador da loja e **imprime as comandas sozinho**, direto na impressora térmica de rede. Não precisa abrir o navegador nem clicar em "Imprimir".

## Como funciona (o conceito)

1. Um pedido é gravado (mesa, pedido online, iFood, 99Food e outros).
2. Com o módulo **Estação de impressão** ligado (Admin → Configurações → Módulos), o próprio banco cria uma **tarefa de impressão** na fila (`print_jobs`).
3. O print server é avisado na hora (*realtime*) e também confere a fila a cada 10 segundos, por segurança.
4. Ele "pega" a tarefa (`claim_print_job`). Só um aparelho consegue pegar cada pedido, então nada sai duplicado.
5. Monta a comanda no formato da térmica (**ESC/POS**) e envia pela rede para o IP da impressora, porta **9100**.
6. Avisa o resultado (`finish_print_job`). Se der erro, a tarefa fica como "falhou" e dá para **reimprimir** pela tela `/impressao`.

As comandas são separadas por **setor**: cada item do cardápio é de *cozinha* ou de *bar*. Cada impressora escolhe se recebe cozinha, bar ou os dois.

O programa só faz conexões de saída (para o Supabase e para as impressoras). Ele não abre nenhuma porta na rede da loja.

## O que você precisa

- Um computador Windows (ou Linux/Mac) ligado durante o expediente, na **mesma rede** das impressoras.
- **Node.js 20.6 ou mais novo**: https://nodejs.org
- Impressora térmica **de rede** (com cabo de rede ou Wi-Fi, IP fixo). Impressora só USB ainda não é atendida por esta versão.

## Passo a passo

1. **Impressora no POP9**: em Admin → Configurações → Impressoras, cadastre (ou edite) a impressora:
   - Gatilho: **Comanda da cozinha/bar**
   - Conexão: **Rede (TCP / print server)**
   - IP da impressora (ex.: `192.168.0.50`) e porta `9100`
   - Setores: Cozinha, Bar ou os dois
2. **Conta do agente**: crie um usuário só para o print server e dê a ele o papel **Cozinha** nesta unidade. Não use sua conta de admin.
3. **Instale** nesta pasta: `npm install`
4. **Configure**: copie `.env.example` para `.env` e preencha (endereço do Supabase, chave pública, e-mail/senha do agente e o ID da unidade).
5. **Teste**: `npm run test-print`. Deve sair uma folha "TESTE POP9" com acentos corretos em cada impressora.
6. **Ligue a fila**: em Admin → Configurações → Módulos, ative **Estação de impressão**.
7. **Rode**: `npm start` (para testar) ou, no Windows, instale para ligar junto com o computador:
   `powershell -ExecutionPolicy Bypass -File windows\install.ps1` (PowerShell como Administrador).
   O log fica em `logs\print-server.log`. Para remover: `windows\uninstall.ps1`.

## Problemas comuns

| Sintoma | O que verificar |
|---|---|
| "Impressora ... não respondeu" | IP/porta certos? O computador alcança a impressora (`ping IP`)? |
| Acentos trocados | Na impressora, a página de código deve aceitar **CP850** (padrão na maioria) |
| Nada imprime | Módulo **Estação de impressão** ligado? A impressora tem o gatilho "Comanda da cozinha/bar" e conexão "Rede"? |
| "Sem impressora para o bar" | Nenhuma impressora marcada com o setor Bar |

## Limites desta versão

- Só **impressoras de rede** (TCP/9100). USB pelo spooler do Windows fica para uma próxima etapa.
- Imprime a **comanda da cozinha/bar**. Conta da mesa e outros gatilhos continuam saindo pelo navegador.
- Se o print server e a Estação no navegador estiverem abertos juntos, quem pegar primeiro imprime (não duplica).

## Aplicativo Windows (.exe)

Em GitHub Actions > Build Windows Print Server EXE > Run workflow, baixe o artifact POP9-Print-Server-Windows quando a compilacao concluir. Extraia e execute POP9-Print-Server-1.0.0-Windows.exe. Formato portatil, sem MSI. A disponibilidade depende de build Windows bem-sucedido.

Na janela preencha URL HTTPS e chave publica do Supabase, email e senha de uma conta de impressao exclusiva e ID da unidade. Salve, inicie o agente e teste a impressora. A opcao de abertura automatica executa o app quando o usuario entra no Windows; manter a janela aberta e necessario. A senha fica criptografada no perfil do usuario pelo mecanismo do Windows. Nunca utilize service_role nem conta de administrador.

Esta versao atende impressoras de rede TCP/9100. USB, funcionamento sem login e download integrado dentro do ERP ainda nao estao disponiveis.
