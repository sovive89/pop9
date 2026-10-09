import { supabase } from "@/integrations/supabase/client";
import type { MenuImportDraft } from "../../supabase/functions/_shared/menu-import-schema";

export type { MenuImportDraft, MenuImportItem, MenuImportRecipeLine, MenuImportCategory } from "../../supabase/functions/_shared/menu-import-schema";
export type ImportModel = { id: string; label: string; provider: string };
export type ExtractResult = { draft: MenuImportDraft; warnings: string[]; conflicts: string[]; knownUnits: Record<string, string> };
export type ApplyResult = {
  categoriesCreated: number; itemsCreated: number; itemsSkipped: string[]; materialsCreated: number;
  recipesCreated: number; recipeLines: number; published: boolean; repeated: boolean;
};

export const ACCEPTED_FILES = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,.txt";
const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain",
};
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Valida tipo e tamanho antes do envio. Retorna a mensagem de erro, ou null se o arquivo é aceito. */
export function checkImportFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!MIME[ext]) return `"${file.name}": formato não aceito. Use PDF, imagem (JPG, PNG, WebP), planilha (XLSX, CSV) ou TXT.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" passa de 10 MB.`;
  if (file.size === 0) return `"${file.name}" está vazio.`;
  return null;
}

async function errorMessage(error: unknown, fallback: string) {
  try {
    const context = (error as { context?: Response }).context;
    const body = await context?.json();
    if (typeof body?.error === "string") return body.error;
  } catch { /* sem corpo JSON */ }
  return fallback;
}

export async function listImportModels(businessUnitId: string): Promise<{ models: ImportModel[]; warning: string }> {
  const { data, error } = await supabase.functions.invoke("admin-assistant", { body: { action: "models", businessUnitId } });
  if (error) throw Error(await errorMessage(error, "Não foi possível consultar os modelos de IA."));
  if (data?.error) throw Error(data.error);
  return { models: Array.isArray(data?.models) ? data.models : [], warning: (data?.warnings ?? []).join(" ") };
}

/** Envia os arquivos para a pasta privada da unidade. Devolve os caminhos no bucket. */
export async function uploadImportFiles(businessUnitId: string, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const problem = checkImportFile(file);
    if (problem) throw Error(problem);
    const ext = file.name.split(".").pop()!.toLowerCase();
    const path = `${businessUnitId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("menu-imports").upload(path, file, { contentType: MIME[ext], upsert: false });
    if (error) {
      if (paths.length) await supabase.storage.from("menu-imports").remove(paths);
      throw Error(`Não foi possível enviar "${file.name}": ${error.message}`);
    }
    paths.push(path);
  }
  return paths;
}

export async function extractMenuDraft(input: { businessUnitId: string; model: string; files: string[]; text: string }): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke("menu-import", {
    body: { action: "extract", businessUnitId: input.businessUnitId, model: input.model, files: input.files, text: input.text, requestId: crypto.randomUUID() },
  });
  if (error) throw Error(await errorMessage(error, "Não foi possível ler os arquivos. Verifique sua conexão e tente novamente."));
  if (data?.error) throw Error(data.error);
  return { draft: data.draft, warnings: data.warnings ?? [], conflicts: data.conflicts ?? [], knownUnits: data.knownUnits ?? {} };
}

/**
 * Grava o rascunho revisado numa transação única. O mesmo requestId pode ser reenviado com
 * segurança após uma falha de rede: o banco devolve o resultado já salvo, sem duplicar.
 */
export async function applyMenuImport(input: { businessUnitId: string; requestId: string; draft: MenuImportDraft; publish: boolean }): Promise<ApplyResult> {
  const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: ApplyResult | null; error: { message: string } | null }>;
  const { data, error } = await rpc("apply_menu_import", {
    p_unit: input.businessUnitId, p_request: input.requestId,
    p_payload: { categories: input.draft.categories, items: input.draft.items }, p_publish: input.publish,
  });
  if (error || !data) throw Error(error?.message ?? "O banco não confirmou a importação.");
  return data;
}
