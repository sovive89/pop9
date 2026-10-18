import { logoSvg, normalizeLayout } from "../../print-server/src/layout.mjs";

export type PrintLogo = { width: number; height: number; hex: string };
export type PrintLayout = {
  header: string;
  footer: string;
  showClient: boolean;
  showOrder: boolean;
  showTime: boolean;
  showModifications: boolean;
  itemSize: "normal" | "large";
  logo: PrintLogo | null;
};

export const defaultPrintLayout = (): PrintLayout => normalizeLayout(null);

/** Apply only bounded structured fields; never accept arbitrary HTML or CSS. */
export function applyPrintLayout(html: string, value?: PrintLayout): string {
  if (!value) return html;
  const layout: PrintLayout = normalizeLayout(value);
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const [show, selector] of [
    [layout.showClient, "[data-print-client]"],
    [layout.showOrder, "[data-print-order]"],
    [layout.showTime, "[data-print-time]"],
    [layout.showModifications, "[data-print-mod]"],
  ] as const) {
    if (!show) doc.querySelectorAll(selector).forEach(node => node.remove());
  }
  if (layout.logo) {
    const logo = doc.createElement("div");
    logo.style.textAlign = "center";
    logo.innerHTML = logoSvg(layout.logo);
    doc.body.prepend(logo);
  }
  if (layout.header) {
    const header = doc.createElement("div");
    header.textContent = layout.header;
    header.style.cssText = "text-align:center;font-weight:bold;white-space:pre-wrap;overflow-wrap:anywhere";
    doc.body.prepend(header);
  }
  if (layout.footer) {
    const footer = doc.createElement("div");
    footer.textContent = layout.footer;
    footer.style.cssText = "text-align:center;white-space:pre-wrap;overflow-wrap:anywhere";
    doc.body.append(footer);
  }
  const style = doc.createElement("style");
  style.textContent = layout.itemSize === "normal"
    ? "td.name{font-size:12px}"
    : "td.name{font-size:16px;font-weight:bold}";
  doc.head.append(style);
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

/** Decode locally, resize, and store a monochrome bitmap usable by ESC/POS. */
export async function readPrintLogo(file: File): Promise<PrintLogo> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error("Use uma imagem PNG, JPEG ou WebP de até 2 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Imagem inválida.");
    const scale = Math.min(256 / image.naturalWidth, 96 / image.naturalHeight, 1);
    const width = Math.max(8, Math.ceil(image.naturalWidth * scale / 8) * 8);
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a logo.");
    context.fillStyle = "white"; context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, image.naturalWidth * scale, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const bytes = new Uint8Array(width / 8 * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114 < 160)
        bytes[y * width / 8 + Math.floor(x / 8)] |= 128 >> (x % 8);
    }
    return { width, height, hex: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("") };
  } finally { URL.revokeObjectURL(url); }
}
