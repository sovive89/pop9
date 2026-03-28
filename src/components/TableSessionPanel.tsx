import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CloseAccountPanel from "@/components/CloseAccountPanel";
import {
  UserPlus,
  X,
  Clock,
  Users,
  Receipt,
  ChevronDown,
  ChevronUp,
  Calculator,
  SplitSquareHorizontal,
  User,
  Lock,
  Eye,
  EyeOff,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type ClientOrder, getClientTotal, getTableTotal, formatCurrency } from "@/utils/orders";
import { buildTableBillReceipt, printReceipt } from "@/utils/thermal-print";
import ServiceChargeToggle from "@/components/ServiceChargeToggle";
import ReceiptPreviewModal from "@/components/ReceiptPreviewModal";

export interface ClientInfo {
  id: string;
  name: string;
  phone?: string;
  addedAt: Date;
  email?: string;
  cep?: string;
  bairro?: string;
  genero?: string;
}

export interface TableSession {
  startedAt: Date;
  endedAt?: Date;
  clients: ClientInfo[];
}

interface Props {
  tableId: number;
  zoneName: string;
  session: (TableSession & { dbId: string }) | null;
  orders: ClientOrder[];
  onStartSession: (client: Omit<ClientInfo, "id" | "addedAt">) => Promise<boolean>;
  onAddClient: (client: Omit<ClientInfo, "id" | "addedAt">) => Promise<boolean>;
  onCloseSession: () => Promise<void>;
  onClose: () => void;
  onSelectClient: (client: ClientInfo) => void;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const validateFullName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Informe o nome completo";
  const parts = trimmed.split(/\s+/).filter((p) => p.length >= 2);
  if (parts.length < 2) return "Informe nome e sobrenome";
  if (trimmed.length > 80) return "Nome muito longo";
  return null;
};

const TableSessionPanel = ({
  tableId,
  zoneName,
  session,
  orders,
  onStartSession,
  onAddClient,
  onCloseSession,
  onClose,
  onSelectClient,
}: Props) => {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCep, setClientCep] = useState("");
  const [clientBairro, setClientBairro] = useState("");
  const [clientGenero, setClientGenero] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(!session);

  const GENERO_OPTIONS = [
    { value: "", label: "Selecione (opcional)" },
    { value: "Masculino", label: "Masculino" },
    { value: "Feminino", label: "Feminino" },
    { value: "Outro", label: "Outro" },
    { value: "Prefiro não dizer", label: "Prefiro não dizer" },
  ];
  const [showCalc, setShowCalc] = useState(false);
  const [calcPeople, setCalcPeople] = useState(2);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closePassword, setClosePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showCloseAccount, setShowCloseAccount] = useState(false);

  const tableTotal = getTableTotal(orders);
  const [includeServiceCharge, setIncludeServiceCharge] = useState(false);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  const tableTotalWithCharge = includeServiceCharge ? tableTotal * 1.1 : tableTotal;
  const serviceChargeAmount = includeServiceCharge ? tableTotal * 0.1 : 0;

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
      await onCloseSession();
      setShowCloseConfirm(false);
      setClosePassword("");
    } catch {
      toast.error("Erro ao verificar senha");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async () => {
    const error = validateFullName(clientName);
    if (error) {
      setNameError(error);
      toast.error(error);
      return;
    }
    setNameError(null);
    const phoneDigits = clientPhone.replace(/\D/g, "");
    if (phoneDigits.length > 0 && phoneDigits.length < 10) {
      toast.error("Celular inválido");
      return;
    }
    const clientData = {
      name: clientName.trim(),
      phone: phoneDigits.length >= 10 ? clientPhone : undefined,
      email: clientEmail.trim() || undefined,
      cep: clientCep.replace(/\D/g, "").length === 8 ? clientCep.replace(/\D/g, "") : undefined,
      bairro: clientBairro.trim() || undefined,
      genero: clientGenero || undefined,
    };
    let ok = false;
    if (session) {
      ok = await onAddClient(clientData);
      if (ok) {
        setShowAddForm(false);
      }
    } else {
      ok = await onStartSession(clientData);
    }
    if (!ok) {
      return;
    }
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setClientCep("");
    setClientBairro("");
    setClientGenero("");
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientPhone(formatPhone(e.target.value));
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (date: Date) =>
    date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg max-h-[90vh] rounded-2xl border border-border bg-card shadow-xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-3xl text-foreground" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              MESA {String(tableId).padStart(2, "0")}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{zoneName}</p>

          {/* Session info */}
          {session && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 mt-4">
              <Clock className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Início</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(session.startedAt)} às {formatTime(session.startedAt)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{session.clients.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {/* Clients as clickable cards */}
          {session && session.clients.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Clientes na mesa
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {session.clients.map((c) => {
                  const clientOrder = orders.find((o) => o.clientId === c.id);
                  const clientTotal = clientOrder ? getClientTotal(clientOrder) : 0;
                  const itemCount = clientOrder ? clientOrder.orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.quantity, 0), 0) + clientOrder.cart.reduce((s, i) => s + i.quantity, 0) : 0;
                  return (
                    <motion.button
                      key={c.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onSelectClient(c)}
                      className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-border bg-secondary/30 p-3 hover:border-primary/50 hover:bg-secondary/60 transition-colors"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-foreground text-center truncate w-full">
                        {c.name.split(" ")[0]}
                      </span>
                      {itemCount > 0 ? (
                        <span className="text-[10px] font-semibold text-primary">
                          {formatCurrency(clientTotal)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Sem pedidos</span>
                      )}
                    </motion.button>
                  );
                })}
                {/* Add client button */}
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowAddForm(true)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground/30 p-3 hover:border-primary/50 transition-colors"
                >
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Adicionar</span>
                </motion.button>
              </div>
            </div>
          )}

          {/* Add client form */}
          {(showAddForm || !session) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-3 rounded-xl border border-border bg-secondary/20 p-4"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {session ? "Novo cliente" : "Registrar primeiro cliente"}
              </p>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome completo</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => { setClientName(e.target.value); if (nameError) setNameError(null); }}
                  placeholder="Nome e sobrenome"
                  maxLength={80}
                  autoFocus
                  className={`mt-1 w-full h-11 rounded-lg border px-4 text-foreground bg-muted placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm ${
                    nameError ? "border-destructive" : "border-border"
                  }`}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Celular <span className="text-muted-foreground/60">(opcional)</span>
                </label>
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={handlePhoneChange}
                  placeholder="(00) 00000-0000"
                  className="mt-1 w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  E-mail <span className="text-muted-foreground/60">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="mt-1 w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    CEP <span className="text-muted-foreground/60">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={clientCep}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setClientCep(v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v);
                    }}
                    placeholder="00000-000"
                    className="mt-1 w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Bairro <span className="text-muted-foreground/60">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={clientBairro}
                    onChange={(e) => setClientBairro(e.target.value)}
                    placeholder="Bairro"
                    maxLength={80}
                    className="mt-1 w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Gênero <span className="text-muted-foreground/60">(opcional)</span>
                </label>
                <select
                  value={clientGenero}
                  onChange={(e) => setClientGenero(e.target.value)}
                  className="mt-1 w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                >
                  {GENERO_OPTIONS.map((o) => (
                    <option key={o.value || "x"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                {session && (
                  <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>
                    Cancelar
                  </Button>
                )}
                <Button className="flex-1 gap-2" onClick={handleSubmit}>
                  <UserPlus className="h-4 w-4" />
                  {session ? "Adicionar" : "Iniciar Sessão"}
                </Button>
                {!session && (
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Voltar
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* Table overview — consumption */}
          {session && orders.length > 0 && (
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Consumo Geral da Mesa
                </p>
              </div>
              {orders.filter((o) => o.orders.length > 0 || o.cart.length > 0).map((o) => {
                const client = session.clients.find((c) => c.id === o.clientId);
                if (!client) return null;
                const clientSub = getClientTotal(o);
                const clientTotalWithCharge = includeServiceCharge ? clientSub * 1.1 : clientSub;
                return (
                  <div key={o.clientId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate">{client.name.split(" ")[0]}</span>
                    <span className="font-semibold text-foreground">{formatCurrency(clientTotalWithCharge)}</span>
                  </div>
                );
              })}
              {includeServiceCharge && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(tableTotal)}</span>
                </div>
              )}
              {includeServiceCharge && (
                <div className="flex items-center justify-between text-xs text-primary">
                  <span>Taxa de serviço (10%)</span>
                  <span>+{formatCurrency(serviceChargeAmount)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{includeServiceCharge ? "Total c/ taxa" : "Total da Mesa"}</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(tableTotalWithCharge)}</span>
              </div>
            </div>
          )}

          {/* Calculator — split bill */}
          {session && tableTotal > 0 && (
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <button
                onClick={() => setShowCalc(!showCalc)}
                className="flex items-center gap-2 w-full"
              >
                <Calculator className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex-1 text-left">
                  Dividir Conta
                </p>
                {showCalc ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {showCalc && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <SplitSquareHorizontal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Dividir por</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCalcPeople(Math.max(2, calcPeople - 1))}
                        className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-foreground">{calcPeople}</span>
                      <button
                        onClick={() => setCalcPeople(Math.min(20, calcPeople + 1))}
                        className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm text-muted-foreground">pessoas</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-2">
                    <span className="text-sm text-foreground">Valor por pessoa</span>
                    <span className="text-lg font-bold text-primary">
                      {formatCurrency(tableTotalWithCharge / calcPeople)}
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {session && !showCloseConfirm && (
          <div className="p-4 pt-0 space-y-2">
            {tableTotal > 0 && (
              <ServiceChargeToggle
                total={tableTotal}
                onPrint={(withCharge) => {
                  const html = buildTableBillReceipt(tableId, session.clients, orders, withCharge);
                  printReceipt(html);
                  setReceiptPreviewHtml(html);
                }}
                label="Imprimir Conta da Mesa"
                includeCharge={includeServiceCharge}
                onIncludeChargeChange={setIncludeServiceCharge}
              />
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 gap-2" onClick={onClose}>
                Voltar ao Mapa
              </Button>
              {tableTotal > 0 ? (
                <Button className="flex-1 gap-2" onClick={() => setShowCloseAccount(true)}>
                  <Receipt className="h-4 w-4" />
                  Fechar Conta
                </Button>
              ) : (
                <Button variant="destructive" className="flex-1" onClick={() => setShowCloseConfirm(true)}>
                  Encerrar Sessão
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Password confirmation modal (for empty tables) */}
        <AnimatePresence>
          {showCloseConfirm && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="p-4 pt-0 space-y-3"
            >
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-destructive" />
                  <p className="text-sm font-semibold text-foreground">Confirmar encerramento</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite sua senha para encerrar a sessão da Mesa {String(tableId).padStart(2, "0")}.
                </p>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={closePassword}
                    onChange={(e) => setClosePassword(e.target.value)}
                    placeholder="Sua senha"
                    autoFocus
                    className="w-full h-11 rounded-lg border border-border bg-muted px-4 pr-10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleCloseSession()}
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
                    className="flex-1 gap-2"
                    onClick={handleCloseSession}
                    disabled={isVerifying}
                  >
                    <Lock className="h-4 w-4" />
                    {isVerifying ? "Verificando..." : "Confirmar"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Preview da conta impressa (tela) */}
      <ReceiptPreviewModal
        receiptHtml={receiptPreviewHtml}
        onClose={() => setReceiptPreviewHtml(null)}
        title="Conta da Mesa"
      />

      {/* Close Account Panel */}
      {showCloseAccount && session && (
        <CloseAccountPanel
          tableId={tableId}
          sessionId={session.dbId}
          clients={session.clients}
          orders={orders}
          onCloseSession={() => {
            onCloseSession();
            setShowCloseAccount(false);
          }}
          onBack={() => setShowCloseAccount(false)}
        />
      )}
    </div>
  );
};

export default TableSessionPanel;
