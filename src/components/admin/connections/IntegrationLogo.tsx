import {
  siWhatsapp,
  siInstagram,
  siTelegram,
  siShopify,
  siWoocommerce,
  siMercadopago,
  siPix,
  siIfood,
  siShopee,
  siGooglegemini,
  siAnthropic,
  siGraphql,
  siPagseguro,
  siAiqfome,
} from "simple-icons";
import type { IntegrationDefinition } from "./types";

/**
 * Mapa fixo slug → ícone do `simple-icons`, com imports nomeados (em vez de
 * `import * as simpleIcons`) de propósito: importar tudo traria os +3000
 * logos da lib inteira pro bundle. Assim só os ~14 usados no catálogo
 * entram no build final.
 *
 * Adicionar uma integração nova com logo oficial disponível na lib = 1
 * import nomeado aqui + 1 linha neste mapa + `simpleIconSlug` no catálogo.
 */
const SIMPLE_ICONS: Record<string, { path: string; hex: string }> = {
  whatsapp: siWhatsapp,
  instagram: siInstagram,
  telegram: siTelegram,
  shopify: siShopify,
  woocommerce: siWoocommerce,
  mercadopago: siMercadopago,
  pix: siPix,
  ifood: siIfood,
  shopee: siShopee,
  googlegemini: siGooglegemini,
  anthropic: siAnthropic,
  graphql: siGraphql,
  pagseguro: siPagseguro,
  aiqfome: siAiqfome,
};

const FALLBACK_PALETTE = ["EF4444", "F97316", "EAB308", "22C55E", "06B6D4", "3B82F6", "8B5CF6", "EC4899"];

/** Cor de fundo do monograma de fallback (1-2 letras) para quando não há
 * logo oficial confiável disponível — nunca um logo "desenhado" para
 * imitar a marca, só uma etiqueta neutra com as iniciais do nome. */
function fallbackColorFor(definition: IntegrationDefinition): string {
  if (definition.fallbackColor) return definition.fallbackColor;
  const index = definition.name.charCodeAt(0) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[index];
}

function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function IntegrationLogo({
  definition,
  size = 40,
  className,
}: {
  definition: IntegrationDefinition;
  size?: number;
  className?: string;
}) {
  const icon = definition.simpleIconSlug ? SIMPLE_ICONS[definition.simpleIconSlug] : undefined;

  if (icon) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Logo ${definition.name}`}
      >
        <svg viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`}>
          <path d={icon.path} />
        </svg>
      </div>
    );
  }

  const bg = fallbackColorFor(definition);
  return (
    <div
      className={className}
      style={{ width: size, height: size, backgroundColor: `#${bg}1a`, color: `#${bg}` }}
      role="img"
      aria-label={`Logo ${definition.name} (indisponível — mostrando iniciais)`}
    >
      <span className="flex h-full w-full items-center justify-center rounded-[inherit] text-xs font-semibold">
        {initialsFor(definition.name)}
      </span>
    </div>
  );
}
