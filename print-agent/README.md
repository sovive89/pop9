# PØP9 Print Agent — Windows (primeira etapa)

Agente local separado do ERP, distribuído como `POP9-Print-Agent.exe`.

## Build / download

Execute **Actions > Windows Print Agent > Run workflow** no GitHub.
Baixe o artifact `POP9-Print-Agent-Windows` após o build. O GitHub gera o EXE
em runner Windows, sem exigir Python no computador do estabelecimento.

## Configuração

Crie `%PROGRAMDATA%\\POP9\\PrintAgent\\config.json`, usando
`config.example.json`. Vincule `device_id` e um token exclusivo do dispositivo
fornecido pelo backend. Configure o nome **exato** das impressoras Windows no
Painel de Controle, ou um endereço de impressora TCP (porta 9100).

Execute o EXE. A janela de console permanece aberta. É possível usar o
Agendador de Tarefas do Windows para iniciar no login; serviço/instalador
com inicialização automática e interface gráfica ainda não estão implementados.

## Protocolo obrigatório no ERP (pendente)

- `GET /jobs?device_id=`: listar apenas jobs destinados ao dispositivo/tenant.
- `POST /jobs/:id/ack`: registrar `printed` ou `failed` de forma idempotente.
- Token por dispositivo, revogável, com escopo exclusivo para jobs de impressão.
- Enfileirar uma comanda por setor, com ID estável, **apenas ao confirmar pedido**.
- Fila persistente no servidor; não considerar ACK recebido como confirmação física do papel.
- O agente salva IDs aceitos pelo spooler em SQLite para reduzir duplicatas após reinício.
- Não usar credenciais administrativas nem `service_role` dentro do EXE.

## Limitações

O agente é uma fundação operacional; **não imprime pedidos do ERP até os endpoints
e o pareamento serem implementados**. O status `printed` significa aceito pelo
spooler/sock TCP, não comprovação física de papel impresso. Falhas após envio podem
exigir reimpressão explícita. Impressoras TCP precisam aceitar texto CP850/ESC-POS.
Não publicar tokens em repositórios ou builds.
