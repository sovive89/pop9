import {useEffect,useState} from "react";
import QRCode from "qrcode";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useOperationalIntegrations} from "@/hooks/useOperationalIntegrations";
import {orderLink} from "@/utils/operationalLinks";

// Link do PWA de pedidos do cliente (/pedir/:unidade). A página pública aplica a Marca da
// unidade quando configurada; sem marca, usa o visual padrão. O domínio vem da conexão
// "PWA próprio" (endereço público) e, se não estiver disponível, do próprio app.
export default function CustomerOrderLink({businessUnitId}:{businessUnitId:string}){
  const {data,error}=useOperationalIntegrations();
  const pwa=data?.integrations.find(r=>r.provider==="own-pwa");
  const configured=pwa?.config.publicOrigin ? orderLink(pwa.config.publicOrigin,businessUnitId,"link") : "";
  const url=configured || orderLink(`${window.location.origin}/`,businessUnitId,"link");
  // Só afirma "desativado" quando a configuração foi lida; atendente/caixa podem não ter acesso a ela.
  const disabled=Boolean(data) && (!pwa?.config.enabled || pwa?.status==="DISCONNECTED");
  const [qr,setQr]=useState("");const [showQr,setShowQr]=useState(false);
  useEffect(()=>{let cancelled=false;setQr("");if(!url)return;void QRCode.toDataURL(url,{width:220,margin:1}).then(v=>{if(!cancelled)setQr(v);}).catch(()=>{});return()=>{cancelled=true;};},[url]);
  const whatsappShare=`https://wa.me/?text=${encodeURIComponent(`Faça seu pedido para retirada: ${url}`)}`;
  const copy=async()=>{try{await navigator.clipboard.writeText(url);toast.success("Link copiado");}catch{toast.error("Não foi possível copiar. Selecione o endereço.");}};
  const share=async()=>{try{await navigator.share({title:"Faça seu pedido",url});}catch{/* cancelado pelo usuário */}};
  return <section className="space-y-2 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">Link de pedidos para retirada — WhatsApp e redes</h2>
    <p className="text-sm text-muted-foreground">Para clientes fora do salão: envie pelo WhatsApp, Instagram, bio ou anúncio. O pedido entra aqui como retirada e usa a marca da unidade, quando configurada.</p>
    <p className="text-xs text-muted-foreground">Não é o QR Code da mesa: o QR da mesa (Admin › QR Codes) abre a comanda daquela mesa no salão.</p>
    <div className="flex flex-wrap gap-2">
      <Input aria-label="Link de pedidos do cliente" readOnly value={url} className="min-w-0 flex-1 font-mono text-xs"/>
      <Button size="sm" variant="outline" disabled={!url} onClick={()=>void copy()}>Copiar</Button>
      <a href={whatsappShare} target="_blank" rel="noopener noreferrer" className={`rounded-md border px-3 py-2 text-sm ${url ? "" : "pointer-events-none opacity-50"}`}>Enviar no WhatsApp</a>
      {typeof navigator.share==="function" && <Button size="sm" variant="outline" disabled={!url} onClick={()=>void share()}>Compartilhar</Button>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-2 text-sm">Abrir</a>}
      <Button size="sm" variant="outline" disabled={!qr} onClick={()=>setShowQr(v=>!v)}>{showQr ? "Ocultar QR" : "QR Code"}</Button>
    </div>
    {showQr && qr && <div className="space-y-1"><img src={qr} alt="QR Code do link de pedidos para retirada" className="h-44 w-44 rounded-md bg-white p-2"/><p className="text-xs text-muted-foreground">Para cartaz, vitrine ou post. Não use nas mesas.</p></div>}
    {disabled && <p role="alert" className="text-sm text-amber-500">Pedidos online estão desativados nesta unidade. Um administrador pode ativar em Admin › Conexões (PWA próprio).</p>}
    {!data && error && <p className="text-xs text-muted-foreground">Usando o endereço deste app.</p>}
  </section>;
}
