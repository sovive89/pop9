type SchemaError = { code?: string; message?: string; details?: string } | null | undefined;

/**
 * Solo un error PostgreSQL/PostgREST de columna opcional ausente permite repetir
 * la consulta con el esquema legado. Errores de RLS, red y otros campos se propagan.
 */
export function isMissingMenuItemOptionalColumn(error: SchemaError, columns: string[]): boolean {
  if (!error) return false;
  if (error.code !== "42703" && error.code !== "PGRST204") return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return columns.some((column) => message.includes(column.toLowerCase()));
}

export const isMissingMenuItemDestinationColumn = (error: SchemaError) =>
  isMissingMenuItemOptionalColumn(error, ["destination"]);
