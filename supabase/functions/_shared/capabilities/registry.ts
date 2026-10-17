/** Metadata only; registering an ID never installs or invokes a handler. */
export type MenuCapabilityId = 'menu.item.prepareDraft' | 'menu.item.previewDraft' | 'menu.item.saveDraft';
export type ExecutorDependency = 'menuAdapterV1' | 'menuPreviewV1' | 'menuCommandV1';
export type Capability = {
  readonly id: MenuCapabilityId;
  readonly version: 1;
  readonly module: 'menu';
  readonly routeId: 'menu';
  readonly allowedRoles: readonly ['admin'];
  readonly effect: 'local' | 'metadata' | 'business';
  readonly confirmation: 'none' | 'exact-preview';
  readonly plannerSelectable: boolean;
  readonly handler: 'menu.prepareLocalDraft' | 'menu.previewDraft' | 'menu.createDraft';
  readonly consequences: readonly string[];
  readonly dependencies: readonly ExecutorDependency[];
};
export const MENU_CAPABILITIES: readonly Capability[] = Object.freeze([
  Object.freeze({ id: 'menu.item.prepareDraft', version: 1, module: 'menu', routeId: 'menu', allowedRoles: ['admin'], effect: 'local', confirmation: 'none', plannerSelectable: true, handler: 'menu.prepareLocalDraft', consequences: ['Preenche um novo item e sua ficha no formulário, sem salvar.'], dependencies: ['menuAdapterV1'] } as const),
  Object.freeze({ id: 'menu.item.previewDraft', version: 1, module: 'menu', routeId: 'menu', allowedRoles: ['admin'], effect: 'metadata', confirmation: 'none', plannerSelectable: false, handler: 'menu.previewDraft', consequences: ['Registra uma revisão para conferência; nenhum produto ou insumo é criado.'], dependencies: ['menuAdapterV1', 'menuPreviewV1', 'menuCommandV1'] } as const),
  Object.freeze({ id: 'menu.item.saveDraft', version: 1, module: 'menu', routeId: 'menu', allowedRoles: ['admin'], effect: 'business', confirmation: 'exact-preview', plannerSelectable: false, handler: 'menu.createDraft', consequences: ['Cria um novo item como rascunho e os vínculos revisados.', 'Novos insumos terão saldo zero, sem lotes ou movimentações.', 'Não publica nem altera itens existentes.'], dependencies: ['menuAdapterV1', 'menuPreviewV1', 'menuCommandV1'] } as const),
]);

/** Must be built from verified identity/database lookups, never from the model/body. */
export type CapabilityContext = {
  unitId: string;
  actorId: string;
  unitActive: boolean;
  rolesForUnit: readonly string[];
  preparationEnabled: boolean;
  executionEnabled: boolean;
  installedDependencies: ReadonlySet<ExecutorDependency>;
};
export function availableMenuCapabilities(context: CapabilityContext): readonly Capability[] {
  if (!context.actorId || !context.unitId || !context.unitActive || !context.rolesForUnit.includes('admin') || !context.preparationEnabled) return [];
  return MENU_CAPABILITIES.filter(capability =>
    (capability.effect === 'local' || context.executionEnabled) &&
    capability.dependencies.every(dependency => context.installedDependencies.has(dependency)),
  );
}
export function requireMenuCapability(id: unknown, version: unknown, context: CapabilityContext, source: 'planner' | 'user'): Capability {
  const capability = availableMenuCapabilities(context).find(row => row.id === id && row.version === version);
  if (!capability || (source === 'planner' && !capability.plannerSelectable)) throw Error('Capacidade indisponível para este contexto.');
  return capability;
}
