export type AgentModel = { id: string; label: string; provider: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseAgentModelsResponse(value: unknown): { models: AgentModel[]; warnings: string[] } {
  if (!isRecord(value)) return { models: [], warnings: [] };
  const models: AgentModel[] = [];
  const ids = new Set<string>();
  for (const entry of Array.isArray(value.models) ? value.models : []) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() ||
        typeof entry.label !== 'string' || !entry.label.trim() ||
        typeof entry.provider !== 'string' || !entry.provider.trim() || ids.has(entry.id)) continue;
    ids.add(entry.id);
    models.push({ id: entry.id, label: entry.label, provider: entry.provider });
  }
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((entry): entry is string => typeof entry === 'string') : [];
  return { models, warnings };
}
