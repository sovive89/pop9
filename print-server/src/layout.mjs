/** Shared, bounded print layout contract for browser previews and ESC/POS. */
export const DEFAULT_LAYOUT = Object.freeze({
  header: "", footer: "", showClient: true, showOrder: true,
  showTime: true, showModifications: true, itemSize: "large", logo: null,
});
export const PRINT_TRIGGERS = ["comanda_cozinha", "comanda_garcom", "conta_mesa", "conta_individual", "pedido_pronto", "etiqueta_producao"];
const cleanText = (value, limit) => typeof value === "string"
  ? value.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(0, limit) : "";
export function normalizeLayout(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = { ...DEFAULT_LAYOUT, header: cleanText(v.header, 80), footer: cleanText(v.footer, 240) };
  for (const key of ["showClient", "showOrder", "showTime", "showModifications"])
    result[key] = typeof v[key] === "boolean" ? v[key] : true;
  result.itemSize = v.itemSize === "normal" ? "normal" : "large";
  const logo = v.logo;
  if (logo && Number.isInteger(logo.width) && logo.width >= 8 && logo.width <= 256 && logo.width % 8 === 0 &&
      Number.isInteger(logo.height) && logo.height > 0 && logo.height <= 96 &&
      typeof logo.hex === "string" && logo.hex.length === logo.width / 8 * logo.height * 2 && /^[0-9a-f]+$/i.test(logo.hex)) {
    result.logo = { width: logo.width, height: logo.height, hex: logo.hex.toLowerCase() };
  }
  return result;
}
export function normalizeLayouts(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const trigger of PRINT_TRIGGERS) if (Object.hasOwn(value, trigger)) result[trigger] = normalizeLayout(value[trigger]);
  return result;
}
/** No network image loads: the editor stores a small monochrome bitmap. */
export function logoSvg(value) {
  const logo = normalizeLayout({ logo: value }).logo;
  if (!logo) return "";
  const rectangles = [];
  for (let y = 0; y < logo.height; y++) for (let x = 0; x < logo.width; x++) {
    const offset = (y * logo.width / 8 + Math.floor(x / 8)) * 2;
    if (parseInt(logo.hex.slice(offset, offset + 2), 16) & (128 >> (x % 8))) rectangles.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logo.width} ${logo.height}" width="${logo.width}" height="${logo.height}" role="img" aria-label="Logo">${rectangles.join("")}</svg>`;
}
