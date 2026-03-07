import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Contact,
  Phone,
  MapPin,
  Calendar,
  Mail,
  Hash,
  User,
  Receipt,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type OrderSummary = { id: string; placed_at: string; status: string };

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cep: string | null;
  bairro: string | null;
  genero: string | null;
  added_at: string;
  session_id: string;
  table_number: number | null;
  zone: string | null;
  started_at: string | null;
  order_count: number;
  orders: OrderSummary[];
};

const formatCep = (cep: string | null) => {
  if (!cep) return "—";
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
};

const CRMTab = () => {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: clientsData, error: clientsErr } = await supabase
        .from("session_clients")
        .select("id, name, phone, email, cep, bairro, genero, added_at, session_id")
        .order("added_at", { ascending: false })
        .limit(500);

      if (clientsErr) {
        setLoading(false);
        return;
      }

      const sessionIds = [...new Set((clientsData ?? []).map((c) => c.session_id))];
      const { data: sessionsData } = await supabase
        .from("sessions")
        .select("id, table_number, zone, started_at")
        .in("id", sessionIds);

      const sessionMap = new Map(
        (sessionsData ?? []).map((s) => [s.id, { table_number: s.table_number, zone: s.zone, started_at: s.started_at }])
      );

      const clientIds = (clientsData ?? []).map((c) => c.id);
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, client_id, placed_at, status")
        .in("client_id", clientIds)
        .neq("status", "cancelled");

      const ordersByClient = new Map<string, OrderSummary[]>();
      for (const o of ordersData ?? []) {
        const list = ordersByClient.get(o.client_id) ?? [];
        list.push({ id: o.id, placed_at: o.placed_at, status: o.status });
        ordersByClient.set(o.client_id, list);
      }

      const rows: ClientRow[] = (clientsData ?? []).map((c) => {
        const s = sessionMap.get(c.session_id);
        const orders = ordersByClient.get(c.id) ?? [];
        return {
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
          cep: c.cep ?? null,
          bairro: c.bairro ?? null,
          genero: c.genero ?? null,
          added_at: c.added_at,
          session_id: c.session_id,
          table_number: s?.table_number ?? null,
          zone: s?.zone ?? null,
          started_at: s?.started_at ?? null,
          order_count: orders.length,
          orders: orders.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()),
        };
      });

      setClients(rows);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-8">Carregando contatos...</div>
    );
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatStatus = (s: string) => {
    const map: Record<string, string> = {
      pending: "Pendente",
      preparing: "Preparando",
      ready: "Pronto",
      delivered: "Entregue",
    };
    return map[s] ?? s;
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
          <Contact className="h-4 w-4" />
          <span className="font-medium">CRM — Contatos e clientes</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Dados coletados no atendimento (nome, telefone, e-mail, CEP, bairro, gênero) e histórico de pedidos por visita.
        </p>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">Nenhum contato registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">Nome</th>
                  <th className="pb-2 pr-2 font-medium">E-mail</th>
                  <th className="pb-2 pr-2 font-medium">Telefone</th>
                  <th className="pb-2 pr-2 font-medium">CEP</th>
                  <th className="pb-2 pr-2 font-medium">Bairro</th>
                  <th className="pb-2 pr-2 font-medium">Gênero</th>
                  <th className="pb-2 pr-2 font-medium">Mesa / Zona</th>
                  <th className="pb-2 pr-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr
                      className="border-b border-border/60 hover:bg-muted/40 align-top"
                    >
                      <td className="py-2.5 pr-2">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {c.name}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        {c.email ? (
                          <span className="inline-flex items-center gap-1 break-all">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {c.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {c.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {c.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {formatCep(c.cep)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2">
                        {c.bairro ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {c.bairro}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {c.genero ? (
                          <span>{c.genero}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {c.table_number != null && c.zone ? (
                          <span className="inline-flex items-center gap-1">
                            Mesa {c.table_number} · {c.zone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {formatDate(c.added_at)}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {c.order_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            {c.order_count} pedido{c.order_count !== 1 ? "s" : ""}
                            {expandedId === c.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                    {expandedId === c.id && c.orders.length > 0 && (
                      <tr key={`${c.id}-orders`} className="bg-muted/30 border-b border-border/60">
                        <td colSpan={9} className="py-2 px-4">
                          <div className="flex flex-wrap gap-3 text-xs">
                            {c.orders.map((o) => (
                              <span
                                key={o.id}
                                className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 border border-border"
                              >
                                <Receipt className="h-3 w-3 text-muted-foreground" />
                                {formatDate(o.placed_at)} — {formatStatus(o.status)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CRMTab;
