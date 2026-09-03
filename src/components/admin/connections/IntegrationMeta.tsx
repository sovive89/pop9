import { ArrowDownToLine, Check, Minus, Repeat, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAPABILITY_LABELS, CAPABILITY_ORDER, TYPE_LABELS } from "./types";
import type { IntegrationCapabilities, IntegrationType } from "./types";

/**
 * Como o tipo e as capacidades de uma integração aparecem na tela.
 *
 * Fica em arquivo próprio porque card e modal mostram a mesma informação em
 * densidades diferentes — o card só o selo de tipo, o modal a lista inteira.
 */

const TYPE_META: Record<IntegrationType, { className: string; Icon: typeof Repeat; hint: string }> = {
  OPERATIONAL: {
    className: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10 dark:text-emerald-400",
    Icon: Repeat,
    hint: "Faz parte da operação do dia a dia — troca dados nos dois sentidos quando a API permite.",
  },
  IMPORT: {
    className: "text-amber-600 border-amber-500/30 bg-amber-500/10 dark:text-amber-400",
    Icon: ArrowDownToLine,
    hint: "Serve para trazer dado legado para dentro do Pipeline. Nunca recebe escrita de volta.",
  },
  SUPPORT: {
    className: "text-pink-600 border-pink-500/30 bg-pink-500/10 dark:text-pink-400",
    Icon: Sparkles,
    hint: "Ferramenta chamada direto pelo sistema — não traz cliente, pedido nem produto.",
  },
};

export function IntegrationTypeBadge({ type, className }: { type: IntegrationType; className?: string }) {
  const meta = TYPE_META[type];
  const { Icon } = meta;
  return (
    <span
      title={meta.hint}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {TYPE_LABELS[type]}
    </span>
  );
}

export function typeHint(type: IntegrationType): string {
  return TYPE_META[type].hint;
}

/** Rótulo do botão principal — o que essa integração faz quando conectada
 * muda conforme o tipo, então o botão não pode dizer sempre "Conectar". */
export function primaryActionLabel(type: IntegrationType): string {
  if (type === "IMPORT") return "Importar dados";
  if (type === "SUPPORT") return "Configurar";
  return "Conectar";
}

/**
 * Lista de capacidades declaradas. `API_DEPENDENT` aparece como "depende da
 * API" de propósito — é diferente de um "sim" e de um "não", e essa
 * diferença é o que impede o Outbound Engine de tentar escrever onde o
 * parceiro não libera escrita.
 */
export function IntegrationCapabilityList({ capabilities }: { capabilities: IntegrationCapabilities | null }) {
  if (!capabilities) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Integração de apoio: é chamada diretamente pelo sistema e não passa pelo fluxo de importação e
        normalização de dados — por isso não declara capacidades de leitura/escrita.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-2">
      {CAPABILITY_ORDER.map((capability) => {
        const support = capabilities[capability];
        return (
          <div key={capability} className="flex items-center gap-2 text-xs">
            {support === "YES" ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={support === "NO" ? "text-muted-foreground line-through" : "text-foreground"}>
              {CAPABILITY_LABELS[capability]}
            </span>
            {support === "API_DEPENDENT" && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                depende da API
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
