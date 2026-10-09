import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {MessageCircle,BookOpen,Send,Loader2,RotateCcw} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {useUnitRoles} from '@/hooks/useUnitRoles';
import {useCurrentBusinessUnit} from '@/hooks/useCurrentBusinessUnit';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {TUTORIALS,type ChatMessage} from '../../supabase/functions/_shared/assistant-help';
type Model={id:string;label:string;provider:string};
type Conversation={scope:string;messages:ChatMessage[];error:string;busy:boolean};
async function invoke(body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke('admin-assistant',{body});
 if(error){
  let message='Não foi possível acessar o assistente. Verifique sua conexão e tente novamente.';
  try{const response=await error.context?.json();if(typeof response?.error==='string')message=response.error;}catch{/* Network errors have no JSON response. */}
  throw Error(message);
 }
 if(data?.error)throw Error(data.error);return data;
}
export default function AdminAssistant(){
 const {user}=useAuth();const {roles,loading:rolesLoading}=useUnitRoles();const {businessUnitId,units}=useCurrentBusinessUnit();
 const location=useLocation(),navigate=useNavigate();
 const scope=`${user?.id}:${businessUnitId}`;const current=useRef(scope);current.current=scope;
 const generation=useRef({scope,version:0});if(generation.current.scope!==scope)generation.current={scope,version:generation.current.version+1};
 const allowed=Boolean(user&&businessUnitId&&!rolesLoading&&roles.includes('admin')&&!/^\/(m(?:\/|$)|pedir(?:\/|$)|login|auth\/|recuperar-senha)/.test(location.pathname));
 const [open,setOpen]=useState(false);const [tab,setTab]=useState<'chat'|'tutorials'>('chat');
 const [conversation,setConversation]=useState<Conversation>({scope:'',messages:[],error:'',busy:false});
 const [modelState,setModelState]=useState<{scope:string;models:Model[];warning:string;loading:boolean}>({scope:'',models:[],warning:'',loading:false});
 const [model,setModel]=useState('');const [context,setContext]=useState('help');const [draft,setDraft]=useState('');
 const [tutorialId,setTutorialId]=useState('menu');const [step,setStep]=useState(0);const [attempt,setAttempt]=useState(0);
 const end=useRef<HTMLDivElement>(null);const sending=useRef(false);
 const visible=conversation.scope===scope?conversation:{scope,messages:[],error:'',busy:false};
 const available=modelState.scope===scope?modelState:{scope,models:[],warning:'',loading:true};
 const unitName=units.find(u=>u.id===businessUnitId)?.name??'Unidade selecionada';
 const tutorial=TUTORIALS.find(t=>t.id===tutorialId)??TUTORIALS[0];
 useEffect(()=>{setDraft('');setModel('');setContext('help');setOpen(false);sending.current=false;setConversation({scope,messages:[],error:'',busy:false});},[scope]);
 useEffect(()=>{if(!allowed)setOpen(false);},[allowed]);
 useEffect(()=>{
  if(!allowed||!open)return;let disposed=false;
  setModelState({scope,models:[],warning:'',loading:true});
  void invoke({action:'models',businessUnitId}).then(data=>{
   if(disposed||current.current!==scope)return;
   const models=Array.isArray(data.models)?data.models:[];
   setModelState({scope,models,warning:(data.warnings??[]).join(' '),loading:false});setModel(prev=>models.some((m:Model)=>m.id===prev)?prev:models[0]?.id??'');
  }).catch(e=>{if(!disposed&&current.current===scope)setModelState({scope,models:[],warning:e.message,loading:false});});
  return ()=>{disposed=true;};
 },[allowed,open,businessUnitId,scope,attempt]);
 useEffect(()=>{if(open&&tab==='chat')end.current?.scrollIntoView({block:'nearest'});},[visible.messages.length,visible.busy,open,tab]);
 async function send(){
  if(!draft.trim()||visible.busy||sending.current||!allowed||!available.models.some(m=>m.id===model))return;
  const requestScope=scope;const requestVersion=generation.current.version;const question=draft.trim();const messages=[...visible.messages.slice(-14),{role:'user' as const,content:question}];
  sending.current=true;setDraft('');setConversation({scope:requestScope,messages,error:'',busy:true});
  try{
   const data=await invoke({action:'chat',businessUnitId,model,context,page:location.pathname+location.search,messages,requestId:crypto.randomUUID()});
   if(current.current!==requestScope||generation.current.version!==requestVersion)return;
   if(typeof data.reply!=='string'||!data.reply)throw Error('A IA não retornou resposta.');
   setConversation({scope:requestScope,messages:[...messages,{role:'assistant',content:data.reply}],error:'',busy:false});
  }catch(e){if(current.current===requestScope&&generation.current.version===requestVersion){setConversation({scope:requestScope,messages,error:e instanceof Error?e.message:'Falha na conversa',busy:false});setDraft(question);}}
  finally{if(current.current===requestScope&&generation.current.version===requestVersion)sending.current=false;}
 }
 if(!allowed)return null;
 return <>
  <Button className="fixed bottom-4 right-4 z-40 gap-2 rounded-full shadow-lg" aria-label="Abrir assistente de IA e tutoriais" data-tooltip="Converse com o assistente e veja tutoriais do ERP." onClick={()=>setOpen(true)}><MessageCircle className="h-5 w-5"/><span className="hidden sm:inline">Assistente</span></Button>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="flex h-[min(760px,92dvh)] w-[calc(100%-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-6">
    <DialogHeader><DialogTitle>Assistente PØP9</DialogTitle><DialogDescription>{unitName} · Administrador</DialogDescription></DialogHeader>
    <div className="flex gap-2" role="tablist" aria-label="Modo do assistente"><Button role="tab" aria-selected={tab==='chat'} variant={tab==='chat'?'default':'outline'} onClick={()=>setTab('chat')}><MessageCircle className="mr-2 h-4 w-4"/>Conversa</Button><Button role="tab" aria-selected={tab==='tutorials'} variant={tab==='tutorials'?'default':'outline'} onClick={()=>setTab('tutorials')}><BookOpen className="mr-2 h-4 w-4"/>Tutoriais</Button></div>
    {tab==='chat'?<>
     <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Modelo<select aria-label="Modelo de conversa" className="w-full rounded-md border bg-background p-2" value={model} disabled={available.loading||visible.busy} onChange={e=>setModel(e.target.value)}>{!available.models.length&&<option value="">{available.loading?'Verificando IA...':'IA indisponível'}</option>}{available.models.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label className="space-y-1 text-sm">Dados para consultar<select aria-label="Dados para consultar" className="w-full rounded-md border bg-background p-2" value={context} disabled={visible.busy} onChange={e=>setContext(e.target.value)}><option value="help">Ajuda e tutoriais</option><option value="menu">Cardápio da unidade</option><option value="stock">Estoque da unidade</option><option value="orders">Pedidos das últimas 24 horas</option></select></label>
     </div>
     {!available.loading&&(!available.models.length||available.warning)&&<div role="status" className="space-y-2 rounded-md border p-3 text-sm"><p>{available.warning||'Conecte um provedor de conversa em Conexões. Os tutoriais já estão disponíveis.'}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>{setOpen(false);navigate('/admin?sec=connections');}}>Configurar IA</Button><Button size="sm" variant="outline" onClick={()=>setAttempt(v=>v+1)}>Verificar novamente</Button><Button size="sm" variant="outline" onClick={()=>setTab('tutorials')}>Ver tutoriais</Button></div></div>}
     <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border p-3" role="log" aria-label="Conversa com o assistente" aria-live="polite">
      {!visible.messages.length&&<div className="space-y-3 text-sm"><p>Posso explicar esta tela, orientar a equipe ou ajudar a analisar os dados da unidade. O que você precisa?</p><div className="flex flex-wrap gap-2">{['Como montar uma ficha técnica?','Como encerrar uma mesa no caixa?','Explique a tela atual.'].map(q=><Button key={q} size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={()=>setDraft(q)}>{q}</Button>)}</div></div>}
      {visible.messages.map((m,i)=><div key={i} className={`rounded-lg p-3 text-sm ${m.role==='user'?'ml-5 bg-primary/15':'mr-5 bg-muted'}`}><p className="mb-1 text-xs font-semibold">{m.role==='user'?'Você':'Assistente'}</p><p className="whitespace-pre-wrap break-words">{m.content}</p></div>)}
      {visible.busy&&<p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Consultando a IA...</p>}
      {visible.error&&<p role="alert" className="text-sm text-destructive">{visible.error}</p>}<div ref={end}/>
     </div>
     <p className="text-xs text-muted-foreground">Orientações e sugestões. Confirme alterações nas telas do ERP. Sua pergunta e os dados selecionados são enviados ao provedor de IA.</p>
     <form className="flex items-end gap-2" onSubmit={e=>{e.preventDefault();void send();}}><Textarea aria-label="Mensagem para o assistente" placeholder="Escreva sua dúvida..." value={draft} maxLength={4000} disabled={visible.busy} onChange={e=>setDraft(e.target.value)} className="min-h-[64px] max-h-32" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><Button type="submit" size="icon" aria-label="Enviar mensagem" disabled={!draft.trim()||visible.busy||!model||available.loading}><Send className="h-4 w-4"/></Button><Button type="button" size="icon" variant="outline" aria-label="Limpar conversa" disabled={visible.busy} onClick={()=>{setConversation({scope,messages:[],error:'',busy:false});setDraft('');}}><RotateCcw className="h-4 w-4"/></Button></form>
    </>:<div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
     <p className="text-sm text-muted-foreground">Guias passo a passo, disponíveis mesmo sem conexão à IA.</p>
     <label className="block space-y-1 text-sm">Tutorial<select aria-label="Escolher tutorial" className="w-full rounded-md border bg-background p-2" value={tutorialId} onChange={e=>{setTutorialId(e.target.value);setStep(0);}}>{TUTORIALS.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
     <div className="space-y-4 rounded-xl border p-4"><h3 className="font-semibold">{tutorial.title}</h3><p className="text-xs text-muted-foreground">Passo {step+1} de {tutorial.steps.length}</p><progress aria-label="Progresso do tutorial" className="h-2 w-full accent-primary" max={tutorial.steps.length} value={step+1}/><p className="text-sm leading-relaxed">{tutorial.steps[step]}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={step===0} onClick={()=>setStep(s=>s-1)}>Anterior</Button>{step<tutorial.steps.length-1?<Button onClick={()=>setStep(s=>s+1)}>Próximo passo</Button>:<Button onClick={()=>setStep(0)}>Recomeçar</Button>}<Button variant="outline" onClick={()=>{setOpen(false);navigate(tutorial.page);}}>Abrir área</Button></div></div>
     <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Ver todos os passos</summary><ol className="ml-5 mt-3 list-decimal space-y-3">{tutorial.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></details>
     <Button variant="outline" onClick={()=>{setDraft(`Me ajude com o tutorial: ${tutorial.title}. Minha dúvida é: `);setTab('chat');}}>Perguntar sobre este tutorial</Button>
    </div>}
   </DialogContent>
  </Dialog>
 </>;
}
