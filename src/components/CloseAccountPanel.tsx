import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Receipt,
  User,
  Users,
  Printer,
  Calculator,
  SplitSquareHorizontal,
  X,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  CreditCard,
  Banknote,
  Smartphone,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientOrder,
  getClientTotal,
  getTableTotal,
  getItemUnitPrice,
  formatCurrency,
} from "@/utils/orders";
import { buildClientBillReceipt, buildTableBillReceipt, printReceipt } from "@/utils/thermal-print";
import type { ClientInfo } from "@/components/TableSessionPanel";
import ReceiptPreviewModal from "@/components/ReceiptPreviewModal";

type Tab = "geral" | "individual";
type PaymentMethod = "dinheiro" | "cartao" | "pix";

interface Payment {
  id: string;
  clientId: string;
  amount: number;
  serviceCharge: number;
  method: PaymentMethod;
  cashReceived: number;
  changeGiven: number;
  paidAt: Date;
}

const METHODS: { key: PaymentMethod; label: string; icon: React.ComponentType<any> }[] = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote },
  { key: "cartao", label: "Cartão", icon: CreditCard },
  { key: "pix", label: "Pix", icon: Smartphone },
];

interface Props {
  tableId: number;
  sessionId: string;
  clients: ClientInfo[];
  orders: ClientOrder[];
  onCloseSession: () => void;
  onBack: () => void;
}

const CloseAccountPanel = ({ tableId, sessionId, clients, orders, onCloseSession, onBack }: Props) => {
  const [tab, setTab] = useState<Tab>("geral");
  const [serviceCharge, setServiceCharge] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [calcPeople, setCalcPeople] = useState(clients.length || 2);

  // Payments
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payingClientId, setPayingClientId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [isProcessing, setIsProcessing] = useState(false);
  const [useCustomAmount, setUseCustomAmount] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [cashReceived, setCashReceived] = useState("");

  // Close session confirmation
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closePassword, setClosePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  const [receiptPreviewTitle, setReceiptPreviewTitle] = useState("Conta");

  const tableTotal = getTableTotal(orders);
  const chargeAmount = serviceCharge ? tableTotal * 0.1 : 0;
  const grandTotal = tableTotal + chargeAmount;

  const totalPaid = payments.reduce((s, p) => s + p.amount + p.serviceCharge, 0);
  const remaining = grandTotal - totalPaid;

  // Load existing payments
  const loadPayments = useCallback(async () => {
    const { data } = await supabase
      .from("payments")
      .select("id, client_id, amount, service_charge, method, cash_received, change_given, paid_at")
      .eq("session_id", sessionId);

    if (data) {
      setPayments(data.map((p: any) => ({
        id: p.id,
        clientId: p.client_id,
        amount: Number(p.amount),
        serviceCharge: Number(p.service_charge),
        method: p.method as PaymentMethod,
        cashReceived: Number(p.cash_received ?? 0),
        changeGiven: Number(p.change_given ?? 0),
        paidAt: new Date(p.paid_at),
      })));
    }
  }, [sessionId]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Realtime for payments
  useEffect(() => {
    const channel = supabase
      .channel(`payments-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `session_id=eq.${sessionId}` }, () => {
        loadPayments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, loadPayments]);

  const getClientPaidTotal = (clientId: string) =>
    payments.filter((p) => p.clientId === clientId).reduce((s, p) => s + p.amount + p.serviceCharge, 0);

  const isClientFullyPaid = (clientId: string) => {
    const order = orders.find((o) => o.clientId === clientId);
    if (!order) return true;
    const clientTotal = getClientTotal(order);
    const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
    return getClientPaidTotal(clientId) >= clientTotal + clientCharge - 0.01;
  };

  const isClientPaid = (clientId: string) => isClientFullyPaid(clientId);

  

  const getClientRemaining = (clientId: string) => {
    const order = orders.find((o) => o.clientId === clientId);
    if (!order) return 0;
    const clientTotal = getClientTotal(order);
    const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
    return Math.max(0, clientTotal + clientCharge - getClientPaidTotal(clientId));
  };

  const handlePayClient = async (clientId: string, customPayAmount?: number) => {
    const order = orders.find((o) => o.clientId === clientId);
    if (!order) return;

    const clientTotal = getClientTotal(order);
    const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
    const fullAmount = clientTotal + clientCharge;
    const clientRemaining = getClientRemaining(clientId);

    // Determine payment amount
    let payAmount: number;
    let payServiceCharge: number;

    if (customPayAmount !== undefined && customPayAmount > 0) {
      payAmount = Math.min(customPayAmount, clientRemaining);
      // Proportional service charge
      const proportion = payAmount / fullAmount;
      payServiceCharge = serviceCharge ? clientCharge * proportion : 0;
      // Adjust: amount = payAmount - payServiceCharge (so amount + service_charge = payAmount)
      payAmount = payAmount - payServiceCharge;
    } else {
      payAmount = clientTotal - payments.filter(p => p.clientId === clientId).reduce((s, p) => s + p.amount, 0);
      payServiceCharge = clientCharge - payments.filter(p => p.clientId === clientId).reduce((s, p) => s + p.serviceCharge, 0);
      payAmount = Math.max(0, payAmount);
      payServiceCharge = Math.max(0, payServiceCharge);
    }

    if (payAmount + payServiceCharge < 0.01) {
      toast.error("Valor inválido");
      return;
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const cashVal = paymentMethod === "dinheiro" && cashReceived ? parseFloat(cashReceived) : 0;
      const totalPaying = Math.round((payAmount + payServiceCharge) * 100) / 100;
      const changeVal = paymentMethod === "dinheiro" && cashVal > totalPaying ? Math.round((cashVal - totalPaying) * 100) / 100 : 0;

      const { error } = await supabase.from("payments").insert({
        session_id: sessionId,
        client_id: clientId,
        amount: Math.round(payAmount * 100) / 100,
        service_charge: Math.round(payServiceCharge * 100) / 100,
        method: paymentMethod,
        cash_received: cashVal,
        change_given: changeVal,
        created_by: user?.id,
      });

      if (error) {
        toast.error("Erro ao registrar pagamento");
        console.error(error);
        return;
      }

      const client = clients.find((c) => c.id === clientId);
      toast.success(`Pagamento de ${formatCurrency(payAmount + payServiceCharge)} registrado para ${client?.name.split(" ")[0]}!`);
      setPayingClientId(null);
      setUseCustomAmount(false);
      setCustomAmount("");
    } catch {
      toast.error("Erro ao processar pagamento");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseSession = async () => {
    if (!closePassword.trim()) {
      toast.error("Digite sua senha");
      return;
    }
    setIsVerifying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error("Usuário não autenticado");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: closePassword,
      });
      if (error) {
        toast.error("Senha incorreta");
        return;
      }
      onCloseSession();
    } catch {
      toast.error("Erro ao verificar senha");
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePrintGeneral = () => {
    const html = buildTableBillReceipt(tableId, clients, orders, serviceCharge);
    printReceipt(html);
    setReceiptPreviewTitle("Conta da Mesa");
    setReceiptPreviewHtml(html);
    toast.success("Conta da mesa enviada para impressão");
  };

  const handlePrintClient = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    const order = orders.find((o) => o.clientId === clientId);
    if (!client || !order) return;
    const html = buildClientBillReceipt(tableId, client, order, serviceCharge);
    printReceipt(html);
    setReceiptPreviewTitle(`Conta — ${client.name.split(" ")[0]}`);
    setReceiptPreviewHtml(html);
    toast.success(`Conta de ${client.name.split(" ")[0]} enviada para impressão`);
  };

  const allClientsPaid = clients.every((c) => isClientPaid(c.id));

  const renderClientDetail = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    const order = orders.find((o) => o.clientId === clientId);
    if (!client || !order) return null;

    const clientTotal = getClientTotal(order);
    const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
    const paid = isClientFullyPaid(clientId);
    
    const clientPaid = getClientPaidTotal(clientId);
    const clientRem = getClientRemaining(clientId);
    const clientPayments = payments.filter((p) => p.clientId === clientId);
    return (
      <motion.div
        key={clientId}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-3"
      >
        <button
          onClick={() => setSelectedClient(null)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${paid ? "bg-green-500/20" : "bg-primary/20"}`}>
            {paid ? <Check className="h-5 w-5 text-green-500" /> : <User className="h-5 w-5 text-primary" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{client.name}</p>
            {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
          </div>
          {paid && (
            <span className="text-xs font-semibold text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
              PAGO
            </span>
          )}
        </div>

        {order.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sem pedidos</p>
        ) : (
          <div className="space-y-2">
            {order.orders.flatMap((o) =>
              o.items.map((item, idx) => {
                const unitPrice = getItemUnitPrice(item);
                return (
                  <div key={`${o.id}-${idx}`} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg bg-secondary/30">
                    <div className="flex-1 min-w-0">
                      <span className="text-foreground">{item.quantity}x {item.name}</span>
                      {item.ingredientMods && item.ingredientMods.length > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {item.ingredientMods.map((m) => m.action === "remove" ? `S/ ${m.name}` : `C/ ${m.name}`).join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-foreground ml-2 shrink-0">
                      {formatCurrency(unitPrice * item.quantity)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div className="border-t border-border pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{formatCurrency(clientTotal)}</span>
          </div>
          {serviceCharge && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxa de serviço (10%)</span>
              <span className="text-primary">{formatCurrency(clientCharge)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span className="text-foreground">Total</span>
            <span className="text-primary">{formatCurrency(clientTotal + clientCharge)}</span>
          </div>
        </div>

        {clientPayments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pagamentos</p>
            {clientPaid > 0 && clientRem > 0 && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Pago: {formatCurrency(clientPaid)}</span>
                  <span className="font-semibold text-foreground">Falta: {formatCurrency(clientRem)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (clientPaid / (clientTotal + clientCharge)) * 100)}%` }} />
                </div>
              </div>
            )}
            {clientPayments.map((p) => (
              <div key={p.id} className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="flex-1 text-xs">
                    <span className="font-semibold text-green-500">{formatCurrency(p.amount + p.serviceCharge)}</span>
                    <span className="text-muted-foreground ml-1.5">via {METHODS.find(m => m.key === p.method)?.label ?? p.method}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {p.paidAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {p.method === "dinheiro" && p.cashReceived > 0 && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground ml-6">
                    <span>Recebido: <span className="font-semibold text-foreground">{formatCurrency(p.cashReceived)}</span></span>
                    {p.changeGiven > 0 && (
                      <span>Troco: <span className="font-semibold text-amber-400">{formatCurrency(p.changeGiven)}</span></span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {paid && (
              <p className="text-xs font-semibold text-green-500">✓ Totalmente pago</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={() => handlePrintClient(clientId)}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          {!isClientFullyPaid(clientId) && clientTotal > 0 && (
            <Button
              className="flex-1 gap-2"
              onClick={() => { setPayingClientId(clientId); setPaymentMethod("dinheiro"); setUseCustomAmount(false); setCustomAmount(""); setCashReceived(""); }}
            >
              <CreditCard className="h-4 w-4" />
              Registrar Pgto
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[90vh] rounded-2xl border border-border bg-card shadow-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Receipt className="h-5 w-5 text-primary" />
              <h3 className="text-2xl text-foreground font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                FECHAR CONTA — MESA {String(tableId).padStart(2, "0")}
              </h3>
            </div>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-3 bg-secondary/50 rounded-lg p-1">
            {([
              { key: "geral" as Tab, label: "Conta Geral", icon: Users },
              { key: "individual" as Tab, label: "Individual", icon: User },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setSelectedClient(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Service charge toggle */}
          <button
            onClick={() => setServiceCharge(!serviceCharge)}
            className={`w-full flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors ${
              serviceCharge ? "border-primary bg-primary/10" : "border-border bg-secondary/30"
            }`}
          >
            <span className="text-sm text-foreground">Taxa de serviço (10%)</span>
            <div className="flex items-center gap-2">
              {serviceCharge && (
                <span className="text-sm font-semibold text-primary">
                  +{formatCurrency(chargeAmount)}
                </span>
              )}
              <div className={`h-5 w-9 rounded-full transition-colors relative ${serviceCharge ? "bg-primary" : "bg-muted-foreground/30"}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${serviceCharge ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
            </div>
          </button>

          {/* Payment progress bar */}
          {totalPaid > 0 && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium uppercase tracking-wider">Pagamento Parcial</span>
                <span className="text-foreground font-semibold">
                  {formatCurrency(totalPaid)} / {formatCurrency(grandTotal)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted-foreground/20 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (totalPaid / grandTotal) * 100)}%` }}
                  className={`h-full rounded-full ${allClientsPaid ? "bg-green-500" : "bg-primary"}`}
                />
              </div>
              {remaining > 0 && (
                <p className="text-xs text-muted-foreground">
                  Falta: <span className="font-semibold text-foreground">{formatCurrency(remaining)}</span>
                </p>
              )}
              {allClientsPaid && (
                <p className="text-xs font-semibold text-green-500">✓ Todos os clientes pagaram</p>
              )}
            </div>
          )}

          {tab === "geral" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {/* Per-client summary */}
              {clients.map((client) => {
                const order = orders.find((o) => o.clientId === client.id);
                const clientTotal = order ? getClientTotal(order) : 0;
                const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
                const clientTotalWithCharge = clientTotal + clientCharge;
                const paid = isClientFullyPaid(client.id);
                const clientPaidAmt = getClientPaidTotal(client.id);
                const clientRemaining = getClientRemaining(client.id);
                const hasPartial = clientPaidAmt > 0 && !paid;
                const itemCount = order
                  ? order.orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0)
                  : 0;

                return (
                  <div key={client.id} className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${paid ? "bg-green-500/5 border border-green-500/20" : "bg-secondary/30"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${paid ? "bg-green-500/15" : "bg-primary/15"}`}>
                        {paid ? <Check className="h-4 w-4 text-green-500" /> : <User className="h-4 w-4 text-primary" />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${paid ? "text-green-500" : hasPartial ? "text-primary" : "text-foreground"}`}>
                          {client.name.split(" ")[0]}
                          {paid && <span className="text-[10px] ml-1.5 opacity-70">PAGO</span>}
                          {hasPartial && <span className="text-[10px] ml-1.5 text-primary opacity-70">PARCIAL</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {itemCount} {itemCount === 1 ? "item" : "itens"}
                          {serviceCharge && clientTotal > 0 && (
                            <span className="block mt-0.5">Subtotal {formatCurrency(clientTotal)} + taxa {formatCurrency(clientCharge)}</span>
                          )}
                          {hasPartial && ` • Pago: ${formatCurrency(clientPaidAmt)} • Falta: ${formatCurrency(clientRemaining)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${paid ? "text-green-500 line-through opacity-60" : "text-foreground"}`}>
                        {formatCurrency(clientTotalWithCharge)}
                      </span>
                      {!isClientFullyPaid(client.id) && clientTotal > 0 && (
                        <button
                          onClick={() => { setPayingClientId(client.id); setPaymentMethod("dinheiro"); setUseCustomAmount(false); setCustomAmount(""); setCashReceived(""); }}
                          className="h-7 px-2 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors"
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Totals */}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatCurrency(tableTotal)}</span>
                </div>
                {serviceCharge && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Taxa de serviço (10%)</span>
                    <span className="text-primary">{formatCurrency(chargeAmount)}</span>
                  </div>
                )}
                {totalPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-500">Já pago</span>
                    <span className="text-green-500">-{formatCurrency(totalPaid)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-foreground">{totalPaid > 0 ? "Restante" : "Total da Mesa"}</span>
                  <span className="text-primary">{formatCurrency(Math.max(0, remaining))}</span>
                </div>
              </div>

              {/* Split calculator */}
              <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dividir Conta</span>
                </div>
                <div className="flex items-center gap-3">
                  <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">por</span>
                  <button
                    onClick={() => setCalcPeople(Math.max(2, calcPeople - 1))}
                    className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >-</button>
                  <span className="w-6 text-center text-sm font-bold text-foreground">{calcPeople}</span>
                  <button
                    onClick={() => setCalcPeople(Math.min(20, calcPeople + 1))}
                    className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                  >+</button>
                  <span className="text-sm text-muted-foreground">pessoas</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-2">
                  <span className="text-sm text-foreground">Valor por pessoa</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(grandTotal / calcPeople)}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full gap-2" onClick={handlePrintGeneral}>
                <Printer className="h-4 w-4" />
                Imprimir Conta da Mesa
              </Button>
            </motion.div>
          )}

          {tab === "individual" && !selectedClient && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <p className="text-xs text-muted-foreground">Selecione um cliente para ver a conta individual:</p>
              {clients.map((client) => {
                const order = orders.find((o) => o.clientId === client.id);
                const clientTotal = order ? getClientTotal(order) : 0;
                const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
                const clientTotalWithCharge = clientTotal + clientCharge;
                const paid = isClientPaid(client.id);
                return (
                  <motion.button
                    key={client.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedClient(client.id)}
                    className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border-2 transition-colors ${
                      paid
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-border bg-secondary/20 hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${paid ? "bg-green-500/20" : "bg-primary/20"}`}>
                        {paid ? <Check className="h-5 w-5 text-green-500" /> : <User className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-foreground">
                          {client.name}
                          {paid && <span className="text-[10px] ml-2 text-green-500 font-semibold">PAGO</span>}
                        </p>
                        {client.phone && <p className="text-[10px] text-muted-foreground">{client.phone}</p>}
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${paid ? "text-green-500 line-through opacity-60" : "text-primary"}`}>
                      {formatCurrency(clientTotalWithCharge)}
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}

          {tab === "individual" && selectedClient && renderClientDetail(selectedClient)}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          {!showCloseConfirm ? (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onBack}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-2"
                onClick={() => setShowCloseConfirm(true)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Encerrar Sessão
              </Button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-destructive" />
                <p className="text-sm font-semibold text-foreground">Confirmar encerramento</p>
              </div>
              {remaining > 0 && (
                <p className="text-xs text-warning font-medium">
                  ⚠ Ainda há {formatCurrency(remaining)} pendente de pagamento.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Digite sua senha para encerrar a Mesa {String(tableId).padStart(2, "0")}.
              </p>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={closePassword}
                  onChange={(e) => setClosePassword(e.target.value)}
                  placeholder="Sua senha"
                  className="w-full h-11 rounded-lg border border-border bg-muted px-4 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleCloseSession()}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowCloseConfirm(false); setClosePassword(""); }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={isVerifying}
                  onClick={handleCloseSession}
                >
                  {isVerifying ? "Verificando..." : "Confirmar"}
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Payment method modal */}
      <AnimatePresence>
        {payingClientId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl p-5 space-y-4"
            >
              {(() => {
                const client = clients.find((c) => c.id === payingClientId);
                const order = orders.find((o) => o.clientId === payingClientId);
                const clientTotal = order ? getClientTotal(order) : 0;
                const clientCharge = serviceCharge ? clientTotal * 0.1 : 0;
                const fullAmount = clientTotal + clientCharge;
                const clientPaid = getClientPaidTotal(payingClientId);
                const clientRem = getClientRemaining(payingClientId);

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-bold text-foreground">Registrar Pagamento</h4>
                      <button onClick={() => { setPayingClientId(null); setUseCustomAmount(false); setCustomAmount(""); setCashReceived(""); }} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{client?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Total: {formatCurrency(fullAmount)}
                          {clientPaid > 0 && ` • Pago: ${formatCurrency(clientPaid)}`}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-primary">{formatCurrency(clientRem)}</span>
                    </div>

                    {clientPaid > 0 && (
                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Progresso</span>
                          <span className="font-semibold text-foreground">{Math.round((clientPaid / fullAmount) * 100)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (clientPaid / fullAmount) * 100)}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Forma de Pagamento</p>
                      <div className="grid grid-cols-3 gap-2">
                        {METHODS.map(({ key, label, icon: Icon }) => (
                          <button
                            key={key}
                            onClick={() => setPaymentMethod(key)}
                            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-colors ${
                              paymentMethod === key
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-secondary/20 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-medium">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cash change calculator - only for dinheiro */}
                    {paymentMethod === "dinheiro" && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valor Recebido (Dinheiro)</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={cashReceived}
                            onChange={(e) => setCashReceived(e.target.value)}
                            placeholder={useCustomAmount && customAmount ? parseFloat(customAmount).toFixed(2) : clientRem.toFixed(2)}
                            className="w-full h-12 rounded-lg border border-border bg-muted pl-10 pr-4 text-foreground text-lg font-bold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                        </div>
                        {/* Quick denomination buttons */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {(() => {
                            const payVal = useCustomAmount && customAmount ? parseFloat(customAmount) : clientRem;
                            const denoms = [5, 10, 20, 50, 100, 200];
                            const relevant = denoms.filter(d => d >= payVal);
                            const show = relevant.length > 0 ? relevant.slice(0, 4) : denoms.slice(-4);
                            return show.map(d => (
                              <button
                                key={d}
                                onClick={() => setCashReceived(String(d))}
                                className={`text-xs py-2 rounded-lg border font-semibold transition-colors ${
                                  cashReceived === String(d)
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary"
                                }`}
                              >
                                R$ {d}
                              </button>
                            ));
                          })()}
                        </div>
                        {/* Change display */}
                        {cashReceived && parseFloat(cashReceived) > 0 && (() => {
                          const payVal = useCustomAmount && customAmount ? parseFloat(customAmount) : clientRem;
                          const change = parseFloat(cashReceived) - payVal;
                          if (change > 0) {
                            return (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl bg-green-500/10 border-2 border-green-500/30 p-3 flex items-center justify-between"
                              >
                                <div>
                                  <p className="text-xs text-green-600 font-medium uppercase tracking-wider">Troco</p>
                                  <p className="text-2xl font-bold text-green-500">{formatCurrency(change)}</p>
                                </div>
                                <Banknote className="h-8 w-8 text-green-500/40" />
                              </motion.div>
                            );
                          } else if (change === 0) {
                            return (
                              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2 text-center">
                                <p className="text-xs font-semibold text-green-500">✓ Valor exato — sem troco</p>
                              </div>
                            );
                          } else {
                            return (
                              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-center">
                                <p className="text-xs font-semibold text-destructive">Valor insuficiente — faltam {formatCurrency(Math.abs(change))}</p>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    )}

                    {/* Custom amount toggle */}
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setUseCustomAmount(!useCustomAmount);
                          if (!useCustomAmount) setCustomAmount("");
                        }}
                        className={`w-full flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors ${
                          useCustomAmount ? "border-primary bg-primary/10" : "border-border bg-secondary/30"
                        }`}
                      >
                        <span className="text-sm text-foreground flex items-center gap-2">
                          <Calculator className="h-4 w-4" />
                          Valor personalizado
                        </span>
                        <div className={`h-5 w-9 rounded-full transition-colors relative ${useCustomAmount ? "bg-primary" : "bg-muted-foreground/30"}`}>
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${useCustomAmount ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                      </button>

                      {useCustomAmount && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={clientRem}
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              placeholder={clientRem.toFixed(2)}
                              className="w-full h-12 rounded-lg border border-border bg-muted pl-10 pr-4 text-foreground text-lg font-bold placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div className="flex gap-1.5">
                            {[0.25, 0.5, 0.75].map((pct) => (
                              <button
                                key={pct}
                                onClick={() => setCustomAmount((clientRem * pct).toFixed(2))}
                                className="flex-1 text-[10px] py-1.5 rounded-md bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors font-medium"
                              >
                                {Math.round(pct * 100)}% ({formatCurrency(clientRem * pct)})
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => { setPayingClientId(null); setUseCustomAmount(false); setCustomAmount(""); setCashReceived(""); }}>
                        Cancelar
                      </Button>
                      <Button
                        className="flex-1 gap-2"
                        disabled={isProcessing || (useCustomAmount && (!customAmount || parseFloat(customAmount) <= 0)) || (paymentMethod === "dinheiro" && cashReceived !== "" && parseFloat(cashReceived) < (useCustomAmount && customAmount ? parseFloat(customAmount) : clientRem))}
                        onClick={() => {
                          if (useCustomAmount && customAmount) {
                            const val = parseFloat(customAmount);
                            if (val > clientRem + 0.01) {
                              toast.error(`Valor máximo: ${formatCurrency(clientRem)}`);
                              return;
                            }
                            handlePayClient(payingClientId, val);
                          } else {
                            handlePayClient(payingClientId);
                          }
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {isProcessing
                          ? "Processando..."
                          : useCustomAmount && customAmount
                            ? `Pagar ${formatCurrency(parseFloat(customAmount))}`
                            : `Pagar ${formatCurrency(clientRem)}`}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReceiptPreviewModal
        receiptHtml={receiptPreviewHtml}
        onClose={() => setReceiptPreviewHtml(null)}
        title={receiptPreviewTitle}
      />
    </div>
  );
};

export default CloseAccountPanel;
