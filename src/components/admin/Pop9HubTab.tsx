import { Database } from "lucide-react";

/** Integração futura: nenhuma chamada de API é realizada nesta tela. */
export function Pop9HubTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pop9 Hub</h2>
        <p className="text-sm text-muted-foreground">
          Integração do ERP com o ecossistema Pop9 Hub.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <h3 className="font-medium">Integração com Pop9 Hub</h3>
            <p className="text-sm text-muted-foreground">Conexão indisponível no momento.</p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button type="button" disabled className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50 cursor-not-allowed">
            Conectar
          </button>
          <span className="text-xs text-muted-foreground">Em construção</span>
        </div>
      </div>
    </div>
  );
}
