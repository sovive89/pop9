import {useOperationalIntegrations} from "@/hooks/useOperationalIntegrations";
import {CopyLink} from "@/components/admin/WhatsAppTab";
import {orderLink,whatsappLink} from "@/utils/operationalLinks";
import {Button} from "@/components/ui/button";
export default function OperationalLinks(){
  const {data,businessUnitId,error,loading,reload}=useOperationalIntegrations();
  const pwa=data?.integrations.find(r=>r.provider==="own-pwa");const whatsapp=data?.integrations.find(r=>r.provider==="whatsapp");
  return <section className="space-y-3 rounded-xl border bg-card p-5"><h3 className="font-semibold">Links da operação</h3>
    {loading && <p role="status">Carregando links...</p>}{error && <p role="alert">{error} <Button variant="outline" onClick={()=>void reload()}>Tentar novamente</Button></p>}
    {data && <><CopyLink label="PWA de pedidos próprio" url={businessUnitId ? orderLink(pwa?.config.publicOrigin ?? "",businessUnitId) : ""}/><p className="text-xs text-muted-foreground">{pwa?.config.enabled && pwa.status!=="DISCONNECTED" ? "Pedidos habilitados" : "Pedidos desativados; configure em Conexões"}. Use o link público no perfil e nas respostas rápidas do WhatsApp Business.</p><CopyLink label="WhatsApp Business — pedir" url={whatsappLink(whatsapp?.config.businessPhone ?? "")}/><CopyLink label="Webhook da Meta" url={data.webhookUrl} open={false}/></>}
    <div className="flex flex-wrap gap-4 text-sm"><a className="text-primary underline" href="/pedidos-online">Pedidos online</a><a className="text-primary underline" href="/relatorios">Relatórios</a><a className="text-primary underline" href="/caixa">Caixa</a><a className="text-primary underline" target="_blank" rel="noreferrer" href="https://business.facebook.com/">Meta Business</a><a className="text-primary underline" target="_blank" rel="noreferrer" href="https://portal.ifood.com.br/">Portal iFood</a><a className="text-primary underline" target="_blank" rel="noreferrer" href="https://99app.com/99food/restaurantes/">99Food</a></div>
  </section>;
}
