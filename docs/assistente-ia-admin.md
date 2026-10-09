# Assistente de IA do Pop9 — estudo de viabilidade

Escopo solicitado: um assistente disponível somente para o administrador, capaz de ajudar em toda a PWA. Este documento é uma proposta; o assistente ainda não foi implementado ou ativado.

## Conclusão

É viável aproveitar o React da PWA, a autenticação e as Edge Functions do Supabase e as credenciais de IA por unidade já existentes. O primeiro caso de uso recomendado é montar cardápio e fichas técnicas, porque permite preparar e revisar cadastros sem alterar saldos reais.

O assistente deve conhecer a página aberta, a unidade selecionada e os cadastros autorizados. Deve explicar o sistema, consultar dados e preparar ações usando serviços de domínio existentes. Consultas e rascunhos podem ser feitos na conversa; ações confirmadas devem passar pelas mesmas validações da interface.

## O que já existe no código

| Base | Local | Aproveitamento |
| --- | --- | --- |
| Perfis e autenticação | `src/hooks/useAuth.tsx`, `src/pages/Admin.tsx` | Exibir o assistente apenas ao admin autenticado. |
| Unidade de operação | `src/hooks/useCurrentBusinessUnit.ts` | Contexto obrigatório para consultas e gravações. |
| Credenciais de IA cifradas por unidade | `supabase/functions/manage-ai-credentials/index.ts` | Reaproveitar o armazenamento de chaves no servidor. |
| Verificação de admin na unidade | `supabase/functions/generate-menu-image/index.ts` | Aplicar a mesma autorização em cada ferramenta do assistente. |
| Geração de fotos | `supabase/functions/generate-menu-image/index.ts` | Ferramenta opcional para ilustrar os itens, com custo separado. |
| Cardápio e ficha técnica | `MenuTab.tsx`, `RecipeBuilder.tsx` | Revisar e salvar o resultado do assistente como rascunho. |
| Estoque e receitas | `src/hooks/useStockData.ts` | Reutilizar as regras de cadastro; distinguir cadastro teórico de movimento real. |
| Ajuda das páginas | `src/lib/page-help.ts` | Vocabulário inicial da ajuda contextual. |

Hoje a função de geração cria imagens; não monta um cardápio e não existe um orquestrador de conversa ou ferramentas gerais de IA. Validar a chave de um provedor não comprova que um modelo específico suporta texto, arquivos, saída estruturada ou chamadas de ferramentas. Essas capacidades precisam ser verificadas na implantação.

## Experiência proposta

Um botão de assistente nas telas usadas pelo admin abre um painel que mantém o contexto durante a navegação. A interface deve mostrar a unidade e separar mensagens, propostas de cadastro e ações concluídas. Usuários sem perfil admin não recebem esse botão nem conseguem chamar a API do assistente.

Exemplos:

- “Monte o cardápio de uma hamburgueria com cinco lanches.”
- “Transforme este cardápio fotografado em categorias e itens.”
- “Crie a ficha de um molho para 1 kg e cadastre os insumos que faltam.”
- “Explique por que este item não tem custo calculado.”
- “Quais insumos estão abaixo do mínimo nesta unidade?”
- “Prepare uma entrada de compra de 5 kg de farinha para eu conferir.”
- “Mostre os pedidos aguardando preparo e o relatório de vendas de hoje.”

## Fluxo cardápio → estoque teórico

1. O admin informa o conceito do negócio, descreve os itens ou envia uma fonte.
2. A IA prepara categorias, nomes, descrições, preços informados e ingredientes visíveis.
3. Para a ficha técnica, propõe insumos, quantidades, unidades e receitas de preparações intermediárias. Dados ausentes ficam pendentes para o admin preencher; estimativas ficam identificadas como sugestões.
4. O sistema procura cadastros compatíveis na mesma unidade e apresenta os vínculos para evitar insumos duplicados. Conversões precisam respeitar dimensões: massa, volume e unidade não são intercambiáveis sem um fator conhecido.
5. O admin revisa o conjunto: itens, ficha do prato, receita do molho, insumos existentes e novos.
6. A ação de salvar cria os novos insumos com saldo zero e salva os itens como rascunho. Não cria lotes, compras, produção ou movimentações.
7. Publicar o cardápio e registrar entradas reais são ações posteriores, com resumos próprios para confirmação.

Exemplo: hambúrguer → ficha do hambúrguer → 50 g de molho → receita de referência do molho → tomate e temperos. O cadastro dessa cadeia não significa que o restaurante comprou tomate ou produziu molho.

## Cobertura de toda a PWA

| Área | Ajuda e consultas | Ações propostas para revisão |
| --- | --- | --- |
| Cardápio | Explicar categorias, ingredientes e ficha; revisar dados faltantes | Criar/editar rascunhos e preparar publicação |
| Estoque | Consultar saldos, unidades, custos, lotes e validade | Preparar cadastros, receitas, compras e produções |
| Atendimento | Consultar mesas, sessões e pedidos autorizados | Preparar alterações usando os fluxos existentes |
| Cozinha | Consultar fila e estados de preparo | Preparar atualização ou cancelamento com confirmação |
| Contas e pagamentos | Explicar saldo, divisão, taxa e troco | Preparar registro de pagamento ou encerramento |
| Relatórios e CRM | Explicar indicadores e consultar agregações reais | Preparar filtros e exportações |
| Usuários e unidades | Explicar acessos e organização | Preparar mudanças de cadastro e de permissões |
| Impressoras e QR Codes | Explicar configuração e acesso de clientes | Preparar configuração, impressão e geração de QR |
| Integrações | Explicar o estado e as capacidades disponíveis | Direcionar ao formulário de credenciais existente |
| Documentos e Hub | Explicar o que está disponível | Habilitar ações somente quando o módulo correspondente existir |

“Toda a PWA” significa uma interface única para o admin, com ferramentas delimitadas por domínio. Não implica dar à IA acesso irrestrito ao banco nem transformar módulos em preparação em funcionalidades disponíveis.

## Arquitetura e implementação

- Uma Edge Function de conversa autentica o usuário, valida o perfil admin e sua autorização na unidade, e usa a credencial desta unidade no servidor.
- Um registro de ferramentas define nome, argumentos tipados, permissão, consulta ou gravação, serviço de domínio e resposta verificável. O modelo propõe chamadas; o servidor valida os argumentos e executa apenas ferramentas registradas.
- As consultas incluem a unidade explicitamente e preservam as políticas de acesso. Chaves de API e senhas não entram no contexto do modelo.
- A resposta de montagem usa um schema validado, por exemplo com Zod, e uma tela de revisão. O servidor valida nomes, IDs, preços, unidades, quantidades positivas e dependências entre receitas.
- A execução confirmada usa identificador de proposta e idempotência, para uma repetição de rede não duplicar cadastros ou lançamentos. Operações com múltiplas gravações precisam de uma transação no domínio.
- Antes de criar migrations, inspecionar o banco real e reconciliar tabelas e políticas já existentes, conforme `CLAUDE.md`. O assistente usa o núcleo operacional e não coloca regras de negócio nos conectores.
- As chaves atuais permitem reutilização da configuração, mas será necessário implementar chamadas de texto/ferramentas e validar o modelo escolhido. Imagens podem usar a função já existente quando autorizadas.
- No modo offline, mostrar a ajuda local e permitir preparar texto; consultas atualizadas e ações de IA exigem conexão. Não executar posteriormente uma ação pendente sem revalidar seu contexto e confirmação.
- Registrar unidade, administrador, ferramenta, parâmetros da operação, resultado e custo conhecido. Estabelecer limites de uso por unidade e não afirmar que um lançamento ocorreu sem o retorno do serviço.

## Ordem recomendada

1. Ajuda contextual e consultas do admin, sem gravações.
2. Montagem de cardápio, fichas e insumos teóricos, com revisão e salvamento transacional.
3. Consultas de estoque, cozinha, atendimento, relatórios e CRM.
4. Ações operacionais confirmadas, começando por um domínio de cada vez.
5. Importação de fotos/arquivos e novas capacidades conforme os provedores e módulos estiverem disponíveis.

## Critérios para uma primeira entrega

- Um usuário sem perfil admin recebe recusa do servidor, mesmo chamando a API diretamente.
- Nenhuma ferramenta consulta ou grava dados de uma unidade não autorizada.
- Montar e salvar uma ficha cria cadastros teóricos, sem lotes e sem movimentações.
- Um nome, quantidade, preço ou unidade não informados são apresentados para revisão.
- Uma falha ou repetição não duplica o conjunto de cadastros nem apaga uma ficha existente.
- As ações propostas mostram o efeito esperado antes da confirmação; a conversa distingue proposta, tentativa e resultado confirmado.

O estudo foi feito sobre o código do repositório. Conexões, modelos contratados, migrations aplicadas e permissões do Supabase em produção ainda precisam de validação no ambiente autorizado.

## Implementação posterior — 09/10/2026

O estudo acima foi a base do módulo agora implementado. Há caixa de conversa somente para Administradores, tutoriais locais e consultas de leitura por unidade. Consulte [implantação e limites atuais](admin-assistant-rollout.md). A montagem transacional e as ferramentas de gravação propostas no estudo continuam fora desta primeira versão do assistente.
