import { Database, ArrowDownToLine, ShieldCheck } from "lucide-react";

/**
 * Ponto de entrada para a integração futura ERP ↔ Pop9 Hub.
 * Não faz requisições nem simula conexão enquanto a API não estiver disponível.
 */
export function Pop9HubTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Pop9 Hub</h2>
        <p className="text-sm text-muted-foreground">
          Conecte seu estabelecimento ao ecossistema Pop9 Hub para migrar dados de sistemas anteriores.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <div>
            <h3 className="font-medium">Integração com Pop9 Hub</h3>
            <p className="text-sm text-muted-foreground">Ainda não disponível para conexão.</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Quando a API do Hub estiver pronta, esta área permitirá vincular a conta e
          importar dados autorizados de clientes, CRM, cardápio e histórico operacional.
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Autorização por estabelecimento</span>
          <span className="inline-flex items-center gap-2"><ArrowDownToLine className="h-4 w-4" /> Importação com validação e prevenção de duplicidades</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Nenhum dado será importado até que a API, a autenticação e o fluxo de confirmação sejam implementados.
        </p>
      </div>
    </div>
  );
}
