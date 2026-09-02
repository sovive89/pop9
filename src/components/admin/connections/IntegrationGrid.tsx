import { PackageSearch } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";
import type { IntegrationView } from "./types";

/**
 * Só renderiza o que recebe — nenhuma lógica de busca/filtro mora aqui de
 * propósito, fica toda em `ConnectionsTab`. Isso é o que permite reusar o
 * grid puro em outro lugar no futuro (por categoria, numa busca, etc.) sem
 * duplicar nada.
 */
export function IntegrationGrid({
  views,
  onOpen,
  onDisconnect,
}: {
  views: IntegrationView[];
  onOpen: (view: IntegrationView) => void;
  onDisconnect: (view: IntegrationView) => void;
}) {
  if (views.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <PackageSearch className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nenhuma integração encontrada</p>
        <p className="text-xs text-muted-foreground">Tente ajustar a busca ou os filtros.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {views.map((view) => (
        <IntegrationCard
          key={view.definition.id}
          view={view}
          onOpen={() => onOpen(view)}
          onDisconnect={() => onDisconnect(view)}
        />
      ))}
    </div>
  );
}
