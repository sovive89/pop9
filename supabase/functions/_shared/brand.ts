// Marca (brand) das telas do cliente. Código puro (sem Deno/DOM): usado pela
// função public-order, pela aba Marca do admin e pelo cardápio público.
// Só uma lista fechada de campos passa: logo, fundo e quatro cores.

export type Brand = {
  logo_url: string | null;
  background_url: string | null;
  primary_color: string | null;
  background_color: string | null;
  card_color: string | null;
  text_color: string | null;
};

export const EMPTY_BRAND: Brand = {
  logo_url: null, background_url: null, primary_color: null, background_color: null, card_color: null, text_color: null,
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Prefixo público das imagens de marca de uma unidade no Storage. */
export function brandAssetPrefix(supabaseUrl: string, unit: string) {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/brand-assets/${unit}/`;
}

/** Aceita só cores #rrggbb e imagens da pasta da própria unidade; o resto vira null. */
export function sanitizeBrand(row: Partial<Record<keyof Brand, unknown>> | null | undefined, assetPrefix: string): Brand {
  // Sem prefixo válido (ambiente sem URL do Supabase) nenhuma imagem é aceita.
  if (!/^https:\/\//.test(assetPrefix)) assetPrefix = "\u0000";
  const color = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null);
  const image = (v: unknown) =>
    typeof v === "string" && v.length <= 500 && v.startsWith(assetPrefix) && !/[\s"'()<>\\]/.test(v) && !v.slice(assetPrefix.length).includes("..")
      ? v : null;
  return {
    logo_url: image(row?.logo_url),
    background_url: image(row?.background_url),
    primary_color: color(row?.primary_color),
    background_color: color(row?.background_color),
    card_color: color(row?.card_color),
    text_color: color(row?.text_color),
  };
}

function channel(hex: string, i: number) {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}
/** Contraste WCAG entre duas cores (1 a 21). */
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Converte #rrggbb para o formato "h s% l%" usado pelas variáveis do tema. */
export function hexToHslVar(hex: string) {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Avisos de legibilidade para o admin (não bloqueiam o salvamento). */
export function brandWarnings(b: Brand) {
  const out: string[] = [];
  const text = b.text_color, bg = b.card_color ?? b.background_color;
  if (text && bg && contrast(text, bg) < 4.5) out.push("O texto pode ficar difícil de ler sobre os cartões/fundo (contraste baixo).");
  if (b.primary_color && b.background_color && contrast(b.primary_color, b.background_color) < 1.5) out.push("A cor principal quase some no fundo; os botões podem ficar pouco visíveis.");
  return out;
}

/**
 * Variáveis CSS que o cardápio público aplica só no próprio contêiner.
 * O texto dos botões é escolhido automaticamente (preto ou branco) pelo contraste.
 */
export function brandCssVars(b: Brand): Record<string, string> {
  const vars: Record<string, string> = {};
  if (b.primary_color) {
    vars["--primary"] = hexToHslVar(b.primary_color);
    vars["--primary-foreground"] = contrast(b.primary_color, "#000000") >= contrast(b.primary_color, "#ffffff") ? "0 0% 0%" : "0 0% 100%";
    vars["--ring"] = vars["--primary"];
  }
  if (b.background_color) vars["--background"] = hexToHslVar(b.background_color);
  if (b.card_color) vars["--card"] = hexToHslVar(b.card_color);
  if (b.text_color) {
    vars["--foreground"] = hexToHslVar(b.text_color);
    vars["--card-foreground"] = vars["--foreground"];
    vars["--muted-foreground"] = vars["--foreground"];
  }
  return vars;
}
