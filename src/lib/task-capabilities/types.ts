import type { FieldError, MenuItemDraftV1 } from '../../../supabase/functions/_shared/capabilities/menu-item-schema';
import type { TaskScope } from '../../../supabase/functions/_shared/capabilities/contracts';

export type { MenuItemDraftV1, FieldError };
/** Generation changes on scope loss/switch, including leaving and returning to a unit. */
export type PreparationContext = TaskScope & { generation: number; taskId: string };
export type PrepareResult = { status: 'prepared' } | { status: 'conflict'; reason: 'unsaved_changes' } | { status: 'unavailable' };

/** Interface only. Implement in the controlled editor; never call submit/autosave/DOM clicks. */
export interface MenuFormAdapter {
  readonly actionId: 'menu.item.prepareDraft';
  readonly routeId: 'menu';
  readonly schemaVersion: 1;
  prepareLocalDraft(input: MenuItemDraftV1, context: PreparationContext): Promise<PrepareResult>;
  readLocalDraft(context: PreparationContext): { input: MenuItemDraftV1; inputRevision: number };
  showFieldErrors(errors: FieldError[], context: PreparationContext): void;
  invalidate(context: PreparationContext): void;
}
