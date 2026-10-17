/**
 * Ajuda dos campos de formulário: o que significa e o que preencher.
 * A chave é o rótulo do campo em minúsculas e sem acentos; vale para todas as telas.
 * Um data-tooltip no próprio campo tem prioridade sobre este dicionário.
 */
const HELP: Record<string, string> = {
  "nome": "Nome que aparece para a equipe e, no cardápio, para o cliente. Ex.: X-Burguer da Casa.",
  "chave": "Código interno, sem acento nem espaço (ex.: saladas). O sistema liga itens e pedidos por ele; não muda depois de criado. O cliente vê só o Nome.",
  "chave (slug)": "Código interno, sem acento nem espaço (ex.: saladas). O sistema liga itens e pedidos por ele; não muda depois de criado. O cliente vê só o Nome.",
  "chave (identificador interno)": "Código interno, sem acento nem espaço (ex.: saladas). O sistema liga itens e pedidos por ele; não muda depois de criado. O cliente vê só o Nome.",
  "slug": "Código interno gerado a partir do nome, sem acento nem espaço. Fica gravado nos pedidos; o nome exibido pode mudar.",
  "ordem": "Posição na lista: o menor número aparece primeiro (0 antes de 1). Use 10, 20, 30… para sobrar espaço entre itens.",
  "preco (r$)": "Preço de venda ao cliente, em reais. Use vírgula ou ponto para centavos. Ex.: 32,90.",
  "preco": "Preço de venda ao cliente, em reais. Ex.: 32,90.",
  "categoria": "Grupo do cardápio em que o item aparece (ex.: Lanches, Bebidas). A categoria também define o setor que recebe o pedido.",
  "descricao": "Texto curto que o cliente lê no cardápio: ingredientes e diferenciais. Ex.: Pão brioche, blend 160 g, cheddar.",
  "setor": "Para onde vão os pedidos: Cozinha, Bar, Caixa ou um setor criado em Impressoras. Define a tela e a impressora que recebem a comanda.",
  "sku": "Código interno único do produto, gerado automaticamente. Usado em relatórios, importação e integrações; não precisa preencher.",
  "quantidade": "Quanto deste insumo é usado ou movimentado, na unidade indicada ao lado (g, kg, ml, l, un).",
  "unidade": "Unidade de medida: g (gramas), kg, ml, l (litros) ou un (unidade). Use a mesma unidade em que você compra e confere o estoque.",
  "custo": "Quanto você pagou, em reais, pela quantidade comprada. Usado no custo da ficha técnica e na margem.",
  "custo unitario": "Custo de uma unidade de medida (ex.: R$ por kg). Calculado a partir da compra.",
  "validade": "Data até quando o lote pode ser usado. O estoque avisa antes de vencer.",
  "lote": "Identificação da compra ou produção (ex.: número da nota ou data). Ajuda a rastrear e a usar primeiro o que vence antes.",
  "fornecedor": "Empresa de quem você comprou. Opcional; ajuda a comparar preços e rastrear lotes.",
  "observacao": "Recado livre para a cozinha ou para o registro. Ex.: caprichar no molho, sem gelo.",
  "telefone": "Celular com DDD, só números. Ex.: 61 99999-0000. Usado no WhatsApp e no CRM.",
  "whatsapp": "Número de WhatsApp com DDD, só números. Ex.: 61 99999-0000.",
  "e-mail": "Endereço de e-mail, usado para entrar no sistema ou receber avisos.",
  "senha": "Mínimo de 8 caracteres. Não compartilhe; cada pessoa usa a própria conta.",
  "ip da impressora": "Endereço da impressora na rede da loja (ex.: 192.168.0.50). Aparece na folha de configuração que a própria impressora imprime.",
  "porta": "Porta de rede da impressora. Quase sempre 9100; só mude se o manual indicar outra.",
  "papel": "Largura da bobina: 80 mm (mais comum) ou 58 mm (impressoras pequenas).",
  "copias": "Quantas vias saem a cada impressão. Normalmente 1.",
  "identificador do dispositivo (opcional)": "Nome para reconhecer a impressora (ex.: Térmica Cozinha) ou o nome dela no Windows. Opcional; o print server usa o IP.",
  "tipo": "Tipo do equipamento: térmica para comandas e contas, ou etiqueta adesiva para lotes de produção.",
  "conexao": "Como a impressão chega à impressora: diálogo do navegador, QZ Tray ou rede (print server).",
  "mesa": "Número da mesa. Retirada/balcão usa número próprio.",
  "lugares": "Quantas pessoas cabem na mesa. Usado para organizar o salão.",
  "area": "Ambiente da mesa (ex.: Salão, Varanda). Ajuda a encontrar a mesa no mapa.",
  "cep": "CEP do cliente, só números. Opcional; usado em relatórios por região.",
  "bairro": "Bairro do cliente. Opcional; usado em relatórios por região.",
  "porcao": "Quanto o item rende ou pesa por porção (ex.: 350 g, serve 2).",
  "modo de preparo": "Passo a passo do preparo, para a equipe seguir sempre igual.",
  "nome do produto": "Nome que aparece para a equipe e, no cardápio, para o cliente. Ex.: X-Burguer da Casa.",
  "como cobrar": "Preço fixo do combo, ou desconto (em % ou em R$) sobre a soma dos itens escolhidos.",
  "nome da etapa": "Parte do combo (ex.: Lanche, Bebida). Uma opção = item fixo; várias = o cliente escolhe.",
};

const key = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*:]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Rótulo visível do campo, mesmo quando o <label> não está ligado ao input. */
export function fieldLabel(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const linked = Array.from(element.labels ?? []).map((l) => l.textContent ?? "").join(" ").trim();
    if (linked) return linked;
  }
  // Padrão das telas: <div><label>Nome</label><Input/></div>
  let node: Element | null = element;
  for (let i = 0; i < 3 && node; i++) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const label = Array.from(parent.children).find((c) => c !== node && c.matches("label, [data-field-label]") && !c.contains(element));
    if (label?.textContent?.trim()) return label.textContent.trim();
    node = parent;
  }
  return "";
}

/** Texto do tooltip de um campo: ajuda do dicionário ou instrução padrão com o exemplo. */
export function fieldHelp(element: Element): string {
  const label = fieldLabel(element) || element.getAttribute("aria-label") || "";
  const placeholder = element.getAttribute("placeholder")?.trim() ?? "";
  const known = HELP[key(label)] ?? HELP[key(element.getAttribute("aria-label") ?? "")];
  if (known) return known;
  if (!label && !placeholder) return "";
  const example = placeholder && !/^(ex[.:]?\s)/i.test(placeholder) ? ` Ex.: ${placeholder}.` : placeholder ? ` ${placeholder}.` : "";
  return label ? `Preencha ${label.replace(/[*:]/g, "").trim()}.${example}`.replace(/\.\./g, ".") : `${placeholder}.`.replace(/\.\./g, ".");
}
