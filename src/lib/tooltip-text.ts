/** Default help for shared controls; data-tooltip supplies context-specific help. */
const actions: Record<string, string> = {
  atendimento: "Abra o atendimento para acompanhar mesas e pedidos.",
  cozinha: "Abra a cozinha para acompanhar o preparo dos pedidos.",
  admin: "Abra o painel de administração do estabelecimento.",
  relatórios: "Consulte os indicadores e relatórios da operação.",
  mesas: "Veja as mesas e abra uma sessão de atendimento.",
  pedidos: "Acompanhe os pedidos e seus estados de preparo e entrega.",
  sair: "Encerre sua sessão e volte para a tela de entrada.",
  entrar: "Acesse o sistema com o e-mail e a senha informados.",
  cancelar: "Feche esta edição sem salvar as alterações pendentes.",
  salvar: "Salve as informações preenchidas neste formulário.",
  "salvar rascunho": "Salve o item e sua ficha técnica sem publicar no cardápio.",
  publicar: "Salve o item e sua ficha técnica e publique no cardápio.",
  "voltar para rascunho": "Retire o item do cardápio publicado e mantenha seu cadastro.",
  "exportar csv": "Baixe os dados exibidos em um arquivo CSV.",
  close: "Feche esta janela.",
  "toggle sidebar": "Abra ou recolha o menu de administração.",
  "return to home": "Volte para a página inicial do atendimento.",
};

const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

export function getTooltipText(element: Element): string {
  if (element.getAttribute("data-tooltip") === "false") return "";
  const explicit = normalize(element.getAttribute("data-tooltip"));
  if (explicit) return explicit;

  // Never use input values: passwords, phone numbers and other user data are
  // not descriptions of a control.
  const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/)
    .map(id => element.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
  const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
    ? Array.from(element.labels ?? []).map(label => label.textContent).join(" ") : "";
  const text = normalize(element.getAttribute("title") || element.getAttribute("data-tooltip-native-title") || element.getAttribute("aria-label") || labelledBy || labels ||
    (element.matches("input, textarea, select") ? element.getAttribute("placeholder") : element.textContent));
  if (!text) return "";
  const help = actions[text.toLocaleLowerCase("pt-BR")] ?? text;
  return element.matches(":disabled, [aria-disabled=true]")
    ? `${help} Indisponível no momento; verifique os campos obrigatórios e as permissões.` : help;
}
