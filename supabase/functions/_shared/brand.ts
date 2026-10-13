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
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  about_text: string | null;
  address: string | null;
  opening_hours: string | null;
};

export type InfoKey = "about_text" | "address" | "opening_hours";
export const INFO_LIMITS: Record<InfoKey, number> = { about_text: 500, address: 200, opening_hours: 300 };

/** Texto simples: tira caracteres de controle, limita linhas em branco e tamanho. */
export function cleanInfo(key: InfoKey, v: unknown): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, INFO_LIMITS[key]) : null;
}

export type SocialKey = "instagram_url" | "facebook_url" | "tiktok_url" | "youtube_url" | "website_url";

/** Mesmas regras dos CHECKs da migration 20261013060000_brand_social_links.sql. */
export const SOCIAL_PATTERNS: Record<SocialKey, RegExp> = {
  instagram_url: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/,
  facebook_url: /^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9.\-/?=_]+$/,
  tiktok_url: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/?$/,
  youtube_url: /^https:\/\/(www\.)?youtube\.com\/[A-Za-z0-9@._\-/]+$/,
  website_url: /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s"'<>]*)?$/,
};

/**
 * Aceita o que o dono costuma colar ("@loja", "instagram.com/loja", link completo)
 * e devolve o link https padronizado, ou null se não for um perfil válido.
 */
export function normalizeSocial(key: SocialKey, input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  const handle = v.replace(/^@/, "");
  if (key !== "website_url" && /^[A-Za-z0-9._]+$/.test(handle)) {
    const base = { instagram_url: "https://instagram.com/", facebook_url: "https://facebook.com/", tiktok_url: "https://tiktok.com/@", youtube_url: "https://youtube.com/@" }[key];
    v = base + handle;
  } else {
    v = v.replace(/^http:\/\//i, "https://");
    if (!/^https:\/\//i.test(v)) v = `https://${v}`;
    v = v.replace(/^https:\/\/[^/]+/, (h) => h.toLowerCase());
  }
  v = v.split("#")[0];
  if (key !== "facebook_url" && key !== "website_url") v = v.split("?")[0];
  return v.length <= 200 && SOCIAL_PATTERNS[key].test(v) ? v : null;
}

export const EMPTY_BRAND: Brand = {
  logo_url: null, background_url: null, primary_color: null, background_color: null, card_color: null, text_color: null,
  instagram_url: null, facebook_url: null, tiktok_url: null, youtube_url: null, website_url: null,
  about_text: null, address: null, opening_hours: null,
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
  const social = (k: SocialKey, v: unknown) => (typeof v === "string" && v.length <= 200 && SOCIAL_PATTERNS[k].test(v) ? v : null);
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
    instagram_url: social("instagram_url", row?.instagram_url),
    facebook_url: social("facebook_url", row?.facebook_url),
    tiktok_url: social("tiktok_url", row?.tiktok_url),
    youtube_url: social("youtube_url", row?.youtube_url),
    website_url: social("website_url", row?.website_url),
    about_text: cleanInfo("about_text", row?.about_text),
    address: cleanInfo("address", row?.address),
    opening_hours: cleanInfo("opening_hours", row?.opening_hours),
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
