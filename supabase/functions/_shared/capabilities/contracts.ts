import { candidateRef, strictRecord, type FieldError, type MaterialChoice, type MenuItemDraftV1 } from './menu-item-schema.ts';
import type { MenuCapabilityId } from './registry.ts';

/** Future API contracts. They do not expose an execution endpoint in this delivery. */
export type TaskScope = { actorId: string; unitId: string };
export type TaskState = 'proposed' | 'reviewing' | 'awaiting_confirmation' | 'executing' | 'completed' | 'cancelled' | 'expired' | 'conflict' | 'failed';
export type ReferenceVersion = { kind: 'category' | 'material' | 'asset'; id: string; revision: string };
/** Not planner arguments. Captured from the real editor, then validated by the domain. */
export type ManualMenuFieldsV1 = {
  variants: { name: string }[];
  active: boolean;
  sortOrder: number;
  imageAssetRef: string | null;
  productions: {
    recipeLine: number;
    outputQuantity: string;
    inputs: { material: MaterialChoice; quantity: string; unit: string }[];
  }[];
};
export type CanonicalMenuCommand = {
  contractVersion: 1;
  capabilityId: 'menu.item.saveDraft';
  capabilityVersion: 1;
  taskId: string;
  inputRevision: number;
  scope: TaskScope;
  input: MenuItemDraftV1;
  manualFields: ManualMenuFieldsV1;
  resolvedReferences: { candidateRef: string; kind: 'category' | 'material' | 'asset'; id: string }[];
  dependencies: ReferenceVersion[];
  status: 'draft';
};
export type ServerPreview = {
  id: string;
  taskId: string;
  revision: number;
  inputRevision: number;
  scope: TaskScope;
  capabilityId: MenuCapabilityId;
  schemaVersion: 1;
  commandHash: string;
  expiresAt: string;
  blockers: FieldError[];
  diff: { path: string; before: null; after: unknown }[];
  consequences: string[];
};
export type ExecutionReceipt = {
  id: string;
  taskId: string;
  previewId: string;
  revision: number;
  commandHash: string;
  scope: TaskScope;
  menuItemId: string;
  ingredientIds: string[];
  variantIds: string[];
  recipeItemIds: string[];
  newMaterialIds: string[];
  productionRecipeIds: string[];
  status: 'draft';
  committedAt: string;
};
export type ExecuteRequest = { previewId: string; revision: number };
export function parseExecuteRequest(value: unknown): ExecuteRequest {
  const row = strictRecord(value, ['previewId', 'revision'], '');
  const id = candidateRef(row.previewId, 'previewId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Error('Preview inválido.');
  if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 1) throw Error('Revisão inválida.');
  return { previewId: id, revision: row.revision as number };
}

/** Serialization contract for hashing; rejects values JSON would silently omit/coerce. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, item => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(',')}}`;
  }
  throw Error('Valor não canônico no comando.');
}

/** Must run under the DB lock, after reauthorization; this helper alone grants no access. */
export function assertPreviewConfirmation(preview: ServerPreview, request: ExecuteRequest, scope: TaskScope, latestRevision: number, now: Date): void {
  if (preview.id !== request.previewId || preview.revision !== request.revision || latestRevision !== request.revision) throw Error('A revisão mudou; confira novamente.');
  if (preview.scope.actorId !== scope.actorId || preview.scope.unitId !== scope.unitId) throw Error('Preview fora do contexto autorizado.');
  if (preview.capabilityId !== 'menu.item.saveDraft' || preview.schemaVersion !== 1 || preview.blockers.length) throw Error('Preview não executável.');
  const expiry = Date.parse(preview.expiresAt);
  if (!Number.isFinite(expiry) || !Number.isFinite(now.getTime()) || expiry <= now.getTime()) throw Error('Preview expirado.');
}
