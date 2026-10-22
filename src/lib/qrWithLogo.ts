import QRCode from "qrcode";

/** Fração do lado do QR que a logo ocupa. Com correção de erro "H" o QR aguenta ~30% coberto; 22% deixa folga. */
export const LOGO_FRACTION = 0.22;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // sem isso o canvas fica "sujo" e toDataURL falha
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo"));
    img.src = src;
  });

/**
 * Gera o QR (PNG em data URL). Com logo: nível de correção H e a logo num quadrado
 * branco no centro. Se a logo não carregar, devolve o QR simples (nunca quebra a impressão).
 */
export async function qrWithLogo(text: string, logoUrl: string | null | undefined, width: number): Promise<string> {
  if (!logoUrl) return QRCode.toDataURL(text, { width, margin: 2 });
  try {
    const [canvas, logo] = await Promise.all([
      Promise.resolve(document.createElement("canvas")),
      loadImage(logoUrl),
    ]);
    await QRCode.toCanvas(canvas, text, { width, margin: 2, errorCorrectionLevel: "H" });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    const box = Math.round(canvas.width * LOGO_FRACTION);
    const pad = Math.round(box * 0.1);
    const x = Math.round((canvas.width - box) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - pad, x - pad, box + pad * 2, box + pad * 2);
    // Mantém a proporção da logo dentro do quadrado.
    const scale = Math.min(box / logo.width, box / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.drawImage(logo, x + (box - w) / 2, x + (box - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return QRCode.toDataURL(text, { width, margin: 2 });
  }
}
