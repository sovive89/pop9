import { useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { IntegrationDefinition } from "./types";

/**
 * Logo de uma integração, resolvido em três degraus — sempre buscando o
 * logo REAL da marca, nunca um desenho aproximado:
 *
 * 1. `simple-icons` — logo oficial em vetor, com a cor oficial da marca.
 *    É o melhor caso: escala perfeito e não depende de rede.
 * 2. Ícone do site oficial da marca (`domain` no catálogo) — cobre as
 *    marcas brasileiras que não existem no simple-icons (Saipos, Colibri,
 *    Stone, Omie, Bling...).
 * 3. Monograma com as iniciais — só quando não há nem logo vetorial nem
 *    domínio confirmado, ou quando a imagem do passo 2 falha ao carregar.
 */

/** Mapa fixo slug → ícone do `simple-icons`, com imports nomeados (em vez de
 * `import * as simpleIcons`) de propósito: importar tudo traria os +3000
 * logos da lib inteira pro bundle. */
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

/**
 * De onde vem o ícone do passo 2, em ordem de preferência. São dois
 * provedores independentes: se um estiver fora do ar ou bloqueado na rede
 * do restaurante, o outro ainda resolve, e só então cai no monograma.
 *
 * Fica isolado aqui de propósito — para hospedar os logos no próprio
 * Supabase Storage depois, muda-se esta lista e mais nada.
 */
const BRAND_ICON_SOURCES: ((domain: string, px: number) => string)[] = [
  (domain, px) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${px}`,
  (domain) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
];

const FALLBACK_PALETTE = ["EF4444", "F97316", "EAB308", "22C55E", "06B6D4", "3B82F6", "8B5CF6", "EC4899"];

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
  /** Índice do provedor de ícone em uso; avança a cada erro de carregamento
   * até acabarem as opções, quando then cai no monograma. */
  const [sourceIndex, setSourceIndex] = useState(0);

  // Se a integração exibida mudar (o mesmo componente é reusado na grade),
  // a falha anterior não vale mais para a nova marca.
  useEffect(() => setSourceIndex(0), [definition.slug]);

  // 1. Logo oficial em vetor.
  if (icon) {
    return (
      <div className={className} style={{ width: size, height: size }} role="img" aria-label={`Logo ${definition.name}`}>
        <svg viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`}>
          <path d={icon.path} />
        </svg>
      </div>
    );
  }

  // 2. Ícone do site oficial da marca.
  if (definition.domain && sourceIndex < BRAND_ICON_SOURCES.length) {
    return (
      <div
        className={cn("flex items-center justify-center border border-border bg-background", className)}
        style={{ width: size, height: size }}
      >
        <img
          key={sourceIndex}
          src={BRAND_ICON_SOURCES[sourceIndex](definition.domain, size <= 32 ? 64 : 128)}
          alt={`Logo ${definition.name}`}
          loading="lazy"
          onError={() => setSourceIndex((i) => i + 1)}
          className="h-[70%] w-[70%] object-contain"
        />
      </div>
    );
  }

  // 3. Monograma neutro — nunca um logo imitado.
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
