export const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  // Text fields must never become spreadsheet formulas when opened in Excel.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const buildCsv = (rows: unknown[][]) => `\uFEFF${rows.map(row => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
export const safeFileName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "arquivo";
export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
