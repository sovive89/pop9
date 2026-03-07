import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageCircle, Copy, ExternalLink, Key, Hash } from "lucide-react";

const WEBHOOK_PATH = "/functions/v1/whatsapp-webhook";
const CONFIG_KEYS = {
  welcome: "whatsapp_welcome_message",
  phoneId: "whatsapp_phone_number_id",
  botWebhook: "whatsapp_bot_webhook_url",
} as const;

const WhatsAppTab = () => {
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [botWebhookUrl, setBotWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const webhookUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}${WEBHOOK_PATH}` : "";

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from("app_config").select("key, value").in("key", Object.values(CONFIG_KEYS));
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
      setWelcomeMessage(map[CONFIG_KEYS.welcome] ?? "Olá! Obrigado por falar conosco. Em breve nosso atendimento retorna.");
      setPhoneNumberId(map[CONFIG_KEYS.phoneId] ?? "");
      setBotWebhookUrl(map[CONFIG_KEYS.botWebhook] ?? "");
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = [
      { key: CONFIG_KEYS.welcome, value: welcomeMessage },
      { key: CONFIG_KEYS.phoneId, value: phoneNumberId },
      { key: CONFIG_KEYS.botWebhook, value: botWebhookUrl },
    ];
    for (const { key, value } of rows) {
      await supabase.from("app_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    }
    toast.success("Configurações salvas.");
    setSaving(false);
  };

  const copyWebhook = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL copiada!");
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Carregando...</div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Webhook URL */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageCircle className="h-4 w-4" />
          URL do Webhook (Meta / WhatsApp)
        </div>
        <p className="text-xs text-muted-foreground">
          Cole esta URL no Meta for Developers → WhatsApp → Configuração → Webhook.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={webhookUrl}
            className="font-mono text-sm bg-muted"
          />
          <Button type="button" variant="outline" size="icon" onClick={copyWebhook} title="Copiar">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Secrets (instruções) */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Key className="h-4 w-4" />
          Secrets no Supabase
        </div>
        <p className="text-xs text-muted-foreground">
          Defina estes secrets em: Supabase Dashboard → Edge Functions → whatsapp-webhook → Secrets.
        </p>
        <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
          <li><strong>WHATSAPP_VERIFY_TOKEN</strong> — Token que você define; use o mesmo no Meta ao configurar o webhook.</li>
          <li><strong>WHATSAPP_ACCESS_TOKEN</strong> — Token permanente do app WhatsApp (Meta for Developers).</li>
          <li><strong>WHATSAPP_PHONE_NUMBER_ID</strong> — ID do número de telefone WhatsApp Business.</li>
          <li><strong>WHATSAPP_WELCOME_MESSAGE</strong> (opcional) — Mensagem automática; se vazio, usa o texto salvo abaixo.</li>
          <li><strong>BOT_ATENDIMENTO_WEBHOOK</strong> (opcional) — URL para encaminhar mensagens recebidas.</li>
        </ul>
        <a
          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Documentação WhatsApp Cloud API <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Campos editáveis */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Hash className="h-4 w-4" />
          Referência / Mensagem de boas-vindas
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Mensagem de boas-vindas</Label>
          <textarea
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder="Texto enviado automaticamente ao receber uma mensagem"
            rows={3}
            className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Phone Number ID (referência)</Label>
          <Input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ex.: 123456789012345"
            className="bg-muted"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">URL do bot de atendimento (opcional)</Label>
          <Input
            value={botWebhookUrl}
            onChange={(e) => setBotWebhookUrl(e.target.value)}
            placeholder="https://seu-backend.com/webhook"
            className="bg-muted font-mono text-sm"
          />
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppTab;
