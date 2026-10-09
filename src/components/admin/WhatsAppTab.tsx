import {useEffect,useRef,useState} from "react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useOperationalIntegrations,manageOperational,type OperationalConfig} from "@/hooks/useOperationalIntegrations";
import {orderLink,whatsappLink} from "@/utils/operationalLinks";
const emptyWhatsApp:OperationalConfig={phoneNumberId:"",businessPhone:"",graphVersion:"",botMode:"crm",botWebhookUrl:"",welcomeMessage:"Olá! Bem-vindo. Envie PEDIR para acessar nosso cardápio."};
export function CopyLink({label,url,open=true}:{label:string;url:string;open?:boolean}){
  return <div className="space-y-1"><p className="text-sm font-medium">{label}</p><div className="flex flex-wrap gap-2"><Input aria-label={label} readOnly value={url} className="min-w-0 flex-1 font-mono text-xs"/><Button size="sm" variant="outline" disabled={!url} onClick={async()=>{try{await navigator.clipboard.writeText(url);toast.success("Link copiado");}catch{toast.error("Não foi possível copiar. Selecione o endereço.");}}}>Copiar</Button>{open && url && <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-2 text-sm">Abrir</a>}</div></div>;
}
export default function WhatsAppTab(){
  const {data,loading,error,businessUnitId,scope,reload}=useOperationalIntegrations();
  const [form,setForm]=useState({scope,whatsapp:emptyWhatsApp,pwa:{publicOrigin:"",enabled:false} as OperationalConfig});
  const [busy,setBusy]=useState(false);const current=useRef(scope);current.current=scope;
  useEffect(()=>{if(data)setForm({scope,whatsapp:{...emptyWhatsApp,...data.integrations.find(r=>r.provider==="whatsapp")?.config},pwa:{publicOrigin:"",enabled:false,...data.integrations.find(r=>r.provider==="own-pwa")?.config}});},[data,scope]);
  const whatsapp=form.scope===scope ? form.whatsapp : emptyWhatsApp;const pwa=form.scope===scope ? form.pwa : {publicOrigin:"",enabled:false};
  const change=(key:string,value:string)=>setForm(prev=>({...prev,whatsapp:{...prev.whatsapp,[key]:value}}));
  const save=async(provider:string,action="save")=>{
    if(!businessUnitId || busy)return;setBusy(true);const requestedScope=scope;
    try{const result=await manageOperational({business_unit_id:businessUnitId,provider,action,config:provider==="whatsapp" ? whatsapp : pwa});if(current.current!==requestedScope)return;if(result.success)toast.success(result.message);else toast.warning(result.message);await reload();}
    catch(e){if(current.current===requestedScope)toast.error(e instanceof Error ? e.message : "Falha ao salvar");}
    finally{if(current.current===requestedScope)setBusy(false);}
  };
  useEffect(()=>{setBusy(false);},[scope]);
  if(loading)return <p role="status">Verificando integrações...</p>;
  if(error)return <div role="alert" className="space-y-2"><p>{error}</p><Button onClick={()=>void reload()}>Verificar novamente</Button></div>;
  if(!businessUnitId || !data)return <p>Selecione a unidade.</p>;
  const record=data.integrations.find(r=>r.provider==="whatsapp");
  const state=record?.status==="CONNECTED" ? "Webhook recebendo mensagens" : record?.status==="CONNECTING" ? "Meta validada; aguardando mensagem no webhook" : "Configuração pendente";
  return <section className="space-y-5 rounded-xl border bg-card p-5">
    <div><h2 className="text-lg font-semibold">WhatsApp Business, bot e pedidos próprios</h2><p className="text-sm text-muted-foreground">{state}. {record?.last_sync_at && `Último recebimento: ${new Date(record.last_sync_at).toLocaleString("pt-BR")}.`}</p>{record?.error_message && <p role="alert" className="text-amber-500">{record.error_message}</p>}</div>
    <CopyLink label="Webhook para cadastrar na Meta" url={data.webhookUrl} open={false}/>
    <div className="grid gap-3 sm:grid-cols-2">{([["businessPhone","WhatsApp comercial (país + DDD)","5511999999999"],["phoneNumberId","Phone Number ID na Meta",""],["graphVersion","Versão Graph do aplicativo Meta","v24.0"]] as const).map(([key,label,placeholder])=><label key={key} className="space-y-1 text-sm">{label}<Input value={String(whatsapp[key] ?? "")} placeholder={placeholder} onChange={e=>change(key,e.target.value)}/></label>)}
      <label className="space-y-1 text-sm">Atendimento automático<select aria-label="Atendimento automático" className="w-full rounded-md border bg-background p-2" value={whatsapp.botMode} onChange={e=>change("botMode",e.target.value)}><option value="off">Somente receber e registrar contatos</option><option value="welcome">Boas-vindas + link de pedidos</option><option value="crm">Boas-vindas + coleta opcional para CRM</option><option value="external">Bot externo pelo webhook</option></select></label>
    </div>
    <label className="block space-y-1 text-sm">Mensagem de boas-vindas<textarea className="w-full rounded-md border bg-background p-2" rows={3} maxLength={1500} value={whatsapp.welcomeMessage} onChange={e=>change("welcomeMessage",e.target.value)}/></label>
    {whatsapp.botMode==="external" && <label className="block space-y-1 text-sm">Endereço do bot externo<Input type="url" value={whatsapp.botWebhookUrl} onChange={e=>change("botWebhookUrl",e.target.value)}/><span className="text-xs text-muted-foreground">O mesmo endereço deve ser definido em BOT_ATENDIMENTO_WEBHOOK no backend. Os eventos são assinados com BOT_WEBHOOK_SECRET.</span></label>}
    <div className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">Credenciais no backend</p><p className="text-xs text-muted-foreground">Configure em Supabase → Edge Functions → Secrets. Use WHATSAPP_VERIFY_TOKEN também na Meta e assine o evento messages. Tokens não são salvos neste formulário.</p><ul className="mt-2 space-y-1">{Object.entries(data.readiness).map(([name,configured])=><li key={name}><code>{name==="CASHIER_WORKFLOW" ? "Fluxo do Caixa publicado" : name}</code>{name.startsWith("BOT_") ? " (opcional para bot externo)" : ""}: {configured ? "configurado" : "pendente"}</li>)}</ul></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void save("whatsapp")}>Salvar pré-configuração</Button><Button data-tooltip="Verifique a conta Meta antes de ativar o recebimento de mensagens." disabled={busy} onClick={()=>void save("whatsapp","connect")}>Validar Meta e ativar webhook</Button>{record && <Button variant="outline" disabled={busy} onClick={()=>void save("whatsapp","disconnect")}>Desativar WhatsApp</Button>}</div>
    <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">PWA próprio — pedidos para retirada</h3><label className="block space-y-1 text-sm">Endereço público HTTPS do sistema<Input type="url" placeholder="https://seu-sistema.com" value={pwa.publicOrigin} onChange={e=>setForm(prev=>({...prev,pwa:{...prev.pwa,publicOrigin:e.target.value}}))}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(pwa.enabled)} onChange={e=>setForm(prev=>({...prev,pwa:{...prev.pwa,enabled:e.target.checked}}))}/>Receber pedidos para retirada; pagamento no estabelecimento</label><Button disabled={busy} onClick={()=>void save("own-pwa")}>Salvar PWA</Button>
      <CopyLink label="Link do cardápio para perfil, catálogo e mensagem do WhatsApp Business" url={orderLink(pwa.publicOrigin ?? "",businessUnitId)}/>
      <CopyLink label="Link do WhatsApp para pedir" url={whatsappLink(whatsapp.businessPhone ?? "")}/>
      <p className="text-sm text-muted-foreground">O cliente consulta o cardápio sem login. Para finalizar, envia PEDIR no WhatsApp e recebe um link pessoal válido por 60 minutos. O pedido entra na cozinha e em Pedidos online; o atendimento recebe o pagamento e solicita encerramento ao Caixa.</p>
    </div>
    <p className="text-xs text-muted-foreground">No modo CRM, o cliente autoriza dados opcionais com PERFIL SIM e informa NOME:, EMAIL:, BAIRRO: e PREFERENCIA:. MARKETING SIM autoriza ofertas; SAIR revoga permissões. O recebimento da mensagem não autoriza campanhas.</p>
    <a className="text-sm text-primary underline" href="https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks" target="_blank" rel="noreferrer">Documentação oficial Meta</a>
  </section>;
}
