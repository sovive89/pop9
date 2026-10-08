import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, MessageCircle, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Step = "loading" | "disabled" | "table_number" | "method" | "code" | "done" | "error";
type Method = "staff_code" | "whatsapp_otp";

const CustomerCheckin = () => {
  const { token } = useParams();
  const [step, setStep] = useState<Step>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [method, setMethod] = useState<Method | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpStubMessage, setOtpStubMessage] = useState<string | null>(null);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("customer-checkin", { body });
    if (error) throw new Error("Erro de conexão. Tente novamente.");
    return data;
  };

  const resolveTable = async (num?: string) => {
    setStep("loading");
    try {
      const data = await invoke({ action: "get_table_info", token, table_number: num ? Number(num) : undefined });
      if (data.error) {
        setErrorMsg(data.error);
        setStep("error");
        return;
      }
      if (!data.enabled) {
        setErrorMsg(data.message ?? "Check-in indisponível");
        setStep("disabled");
        return;
      }
      setTableNumber(String(data.table_number));
      setStep("method");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro inesperado");
      setStep("error");
    }
  };

  useEffect(() => {
    if (token) {
      resolveTable();
    } else {
      setStep("table_number");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handlePickMethod = async (m: Method) => {
    setMethod(m);
    if (m === "whatsapp_otp") {
      // aguarda telefone antes de pedir o código
      setStep("code");
      return;
    }
    setStep("code");
  };

  const handleRequestOtp = async () => {
    setIsSubmitting(true);
    setOtpStubMessage(null);
    try {
      const data = await invoke({
        action: "request_code",
        method: "whatsapp_otp",
        table_number: Number(tableNumber),
        phone,
      });
      if (data.stub) {
        setOtpStubMessage(data.message);
      } else if (!data.success) {
        setErrorMsg(data.error ?? "Erro ao enviar código");
        setStep("error");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro inesperado");
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setIsSubmitting(true);
    try {
      const data = await invoke({
        action: "verify_code",
        method,
        table_number: Number(tableNumber),
        code,
        phone: method === "whatsapp_otp" ? phone : undefined,
        name: method === "whatsapp_otp" ? name : undefined,
      });
      if (data.error) {
        setErrorMsg(data.error);
        return;
      }
      setStep("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground text-center" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
          Entrar na mesa
        </h1>

        {step === "loading" && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {step === "disabled" && (
          <p className="text-center text-sm text-muted-foreground py-6">{errorMsg}</p>
        )}

        {step === "error" && (
          <div className="space-y-3">
            <p className="text-center text-sm text-destructive py-2">{errorMsg}</p>
            <Button className="w-full" onClick={() => (token ? resolveTable() : setStep("table_number"))}>
              Tentar novamente
            </Button>
          </div>
        )}

        {step === "table_number" && (
          <div className="space-y-3">
            <label className="text-sm text-muted-foreground">Número da mesa</label>
            <input
              type="number"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full h-12 rounded-lg border border-border bg-muted px-4 text-lg font-bold text-foreground text-center"
              placeholder="00"
            />
            <Button className="w-full" disabled={!tableNumber} onClick={() => resolveTable(tableNumber)}>
              Continuar
            </Button>
          </div>
        )}

        {step === "method" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Mesa {tableNumber} — como você quer entrar?</p>
            <button
              onClick={() => handlePickMethod("staff_code")}
              className="w-full flex items-center gap-3 rounded-xl border-2 border-border p-4 hover:border-primary/50 transition-colors"
            >
              <KeyRound className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">Tenho um código do garçom</span>
            </button>
            <button
              onClick={() => handlePickMethod("whatsapp_otp")}
              className="w-full flex items-center gap-3 rounded-xl border-2 border-border p-4 hover:border-primary/50 transition-colors"
            >
              <MessageCircle className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">Receber código por WhatsApp</span>
            </button>
          </div>
        )}

        {step === "code" && method === "whatsapp_otp" && !otpStubMessage && (
          <div className="space-y-3">
            <label className="text-sm text-muted-foreground">Seu telefone (WhatsApp)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-12 rounded-lg border border-border bg-muted px-4 text-foreground"
              placeholder="(00) 00000-0000"
            />
            <Button className="w-full" disabled={!phone || isSubmitting} onClick={handleRequestOtp}>
              {isSubmitting ? "Enviando..." : "Enviar código"}
            </Button>
          </div>
        )}

        {step === "code" && (method === "staff_code" || otpStubMessage) && (
          <div className="space-y-3">
            {otpStubMessage && (
              <p className="text-xs text-center text-muted-foreground bg-secondary/50 rounded-lg p-2">{otpStubMessage}</p>
            )}
            {method === "whatsapp_otp" && (
              <div>
                <label className="text-sm text-muted-foreground">Seu nome</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 rounded-lg border border-border bg-muted px-4 text-foreground mt-1"
                  placeholder="Nome e sobrenome"
                />
              </div>
            )}
            <div>
              <label className="text-sm text-muted-foreground">Código de acesso</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-12 rounded-lg border border-border bg-muted px-4 text-lg font-bold text-foreground text-center tracking-widest mt-1"
                placeholder="0000"
              />
            </div>
            {errorMsg && <p className="text-xs text-destructive text-center">{errorMsg}</p>}
            <Button
              className="w-full"
              disabled={!code || (method === "whatsapp_otp" && !name) || isSubmitting}
              onClick={handleVerify}
            >
              {isSubmitting ? "Verificando..." : "Confirmar"}
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-center text-sm text-foreground font-medium">
              Você está na Mesa {tableNumber}. Aguarde o garçom para fazer seu pedido.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerCheckin;
