import { useEffect, useState } from "react";
import { Construction, Copy, ExternalLink, Key, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { IntegrationLogo } from "./IntegrationLogo";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { IntegrationCapabilityList, IntegrationTypeBadge, primaryActionLabel, typeHint } from "./IntegrationMeta";
import { isImplemented } from "./providers/registry";
import type { IntegrationConfigField, IntegrationView } from "./types";

/**
 * Formulário genérico: renderiza qualquer combinação de `fields` do
 * catálogo sem conhecer a integração. Campo `secret: true` nunca vira um
 * input que salva valor — mostra só a instrução de onde configurar de
 * verdade (nunca no frontend).
 */
function GenericFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: IntegrationConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-4">
      {fields.map((field) =>
        field.secret ? (
          <div key={field.key} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Key className="h-3.5 w-3.5" /> {field.label}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Por segurança, credenciais como esta nunca ficam armazenadas no navegador — configure-a como variável
              de ambiente/secret no backend (Supabase Edge Function).
            </p>
          </div>
        ) : (
          <div key={field.key} className="space-y-1.5">
            <Label className="text-muted-foreground">{field.label}</Label>
            {field.type === "textarea" ? (
              <textarea
                value={String(values[field.key] ?? "")}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                rows={3}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              />
            ) : (
              <Input
                type={field.type === "url" ? "url" : "text"}
                value={String(values[field.key] ?? "")}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled}
                className="bg-muted"
              />
            )}
            {field.helperText && <p className="text-xs text-muted-foreground">{field.helperText}</p>}
          </div>
        ),
      )}
    </div>
  );
}

/** Conteúdo extra específico do WhatsApp: URL do webhook (pronta pra
 * colar no Meta) + a lista de secrets que precisam ser definidos no
 * Supabase. É a mesma informação que já existia em `WhatsAppTab.tsx` —
 * só passou a viver dentro do modal genérico em vez de uma aba própria. */
function WhatsAppExtras() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const webhookUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook` : "";

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <Label className="text-muted-foreground">URL do Webhook (colar no Meta for Developers)</Label>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs bg-muted" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              if (!webhookUrl) return;
              navigator.clipboard.writeText(webhookUrl);
              toast.success("URL copiada!");
            }}
            title="Copiar"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Key className="h-3.5 w-3.5" /> Secrets no Supabase
        </div>
        <p className="text-xs text-muted-foreground">
          Defina em: Supabase Dashboard → Edge Functions → whatsapp-webhook → Secrets.
        </p>
        <ul className="list-inside list-disc text-xs text-muted-foreground space-y-0.5">
          <li>
            <strong>WHATSAPP_VERIFY_TOKEN</strong> — mesmo valor usado ao configurar o webhook no Meta.
          </li>
          <li>
            <strong>WHATSAPP_ACCESS_TOKEN</strong> — token permanente do app WhatsApp.
          </li>
          <li>
            <strong>WHATSAPP_PHONE_NUMBER_ID</strong> — ID do número WhatsApp Business.
          </li>
        </ul>
      </div>
    </div>
  );
}

const CUSTOM_EXTRAS: Record<string, () => JSX.Element> = {
  whatsapp: WhatsAppExtras,
};

export function IntegrationConfigModal({
  view,
  open,
  onOpenChange,
  onSaveConfig,
  onConnect,
  onDisconnect,
}: {
  view: IntegrationView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveConfig: (slug: string, config: Record<string, unknown>) => Promise<boolean>;
  onConnect: (slug: string, config: Record<string, unknown>) => Promise<boolean>;
  onDisconnect: (slug: string) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<"save" | "connect" | "disconnect" | null>(null);

  useEffect(() => {
    if (view) setValues(view.record?.config ?? {});
  }, [view]);

  if (!view) return null;
  const { definition, status } = view;
  const implemented = isImplemented(definition.slug);
  const Extras = CUSTOM_EXTRAS[definition.slug];

  const handleChange = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const handleSave = async () => {
    setBusy("save");
    await onSaveConfig(definition.slug, values);
    setBusy(null);
  };

  const handleConnect = async () => {
    setBusy("connect");
    const ok = await onConnect(definition.slug, values);
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    const ok = await onDisconnect(definition.slug);
    setBusy(null);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IntegrationLogo definition={definition} size={36} className="shrink-0 overflow-hidden rounded-lg" />
            <div>
              <DialogTitle>{definition.name}</DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <IntegrationStatusBadge status={status} />
                <IntegrationTypeBadge type={definition.type} />
              </div>
            </div>
          </div>
          <DialogDescription className="pt-2 text-left">{definition.whatItEnables}</DialogDescription>
        </DialogHeader>

        {definition.docsUrl && (
          <a
            href={definition.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
          >
            Documentação oficial <ExternalLink className="h-3 w-3" />
          </a>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{typeHint(definition.type)}</p>
          <IntegrationCapabilityList capabilities={definition.capabilities} />
        </div>

        {!implemented ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <Construction className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-medium text-foreground">Configuração necessária</p>
                <p className="text-xs text-muted-foreground">
                  Essa integração ainda está em desenvolvimento — a estrutura do conector já existe, mas falta ligar
                  a API oficial de {definition.name}. Os campos abaixo mostram o que vai ser pedido quando estiver
                  pronta.
                </p>
              </div>
            </div>
            <GenericFields fields={definition.fields} values={values} onChange={handleChange} disabled />
          </div>
        ) : (
          <div className="space-y-4">
            <GenericFields fields={definition.fields} values={values} onChange={handleChange} />
            {Extras && <Extras />}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {status === "CONNECTED" ? (
            <>
              <Button variant="outline" onClick={handleSave} disabled={busy !== null}>
                {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alterações
              </Button>
              <Button variant="destructive" onClick={handleDisconnect} disabled={busy !== null}>
                {busy === "disconnect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Desconectar
              </Button>
            </>
          ) : implemented ? (
            <Button onClick={handleConnect} disabled={busy !== null}>
              {busy === "connect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {primaryActionLabel(definition.type)}
            </Button>
          ) : (
            <Button disabled title="Ainda não implementado">
              Em desenvolvimento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
