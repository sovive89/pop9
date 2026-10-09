import {useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {BookOpen,Loader2,Navigation,Sparkles} from 'lucide-react';
import {useAuth} from '@/hooks/useAuth';
import {useUnitRoles} from '@/hooks/useUnitRoles';
import {useCurrentBusinessUnit} from '@/hooks/useCurrentBusinessUnit';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {AGENT_PAGES,TUTORIALS,canAccessAgentPage,findAgentPage,validateAgentPlan,type AgentTaskPlan} from '../../supabase/functions/_shared/assistant-help';

type Model={id:string;label:string;provider:string};
type AsyncState<T>={scope:string;value:T|null;error:string;busy:boolean};
async function invoke(body:Record<string,unknown>){
 const {data,error}=await supabase.functions.invoke('admin-assistant',{body});
 if(error){let message='Não foi possível acessar o agente. Verifique sua conexão e tente novamente.';try{const response=await error.context?.json();if(typeof response?.error==='string')message=response.error;}catch{/* A falha de rede pode não ter JSON. */}throw Error(message);}
 if(data?.error)throw Error(data.error);return data;
}
const emptyGuided={name:'',category:'',description:'',portion:'',ingredients:'',preparation:'',price:'',extras:'',image:''};
const roleLabels:Record<string,string>={admin:'Administrador',attendant:'Atendente',kitchen:'Cozinha',cashier:'Caixa'};
const guidedFields=[{key:'name',label:'Nome do produto',hint:'Ex.: Burger PØP9'},{key:'category',label:'Categoria e tipo',hint:'Ex.: hambúrguer, bebida, sobremesa'},{key:'description',label:'Descrição comercial',hint:'Características e apresentação'},{key:'portion',label:'Porção e rendimento',hint:'Ex.: 1 unidade de 350 g'},{key:'ingredients',label:'Ingredientes e quantidades',hint:'Um por linha; inclua unidade de medida'},{key:'preparation',label:'Modo de preparo e pré-preparos',hint:'Etapas, perdas e conservação, se aplicável'},{key:'price',label:'Preço de venda',hint:'Valor informado por você ou “a definir”'},{key:'extras',label:'Variações e adicionais',hint:'Opcionais e restrições'},{key:'image',label:'Orientações para fotografia',hint:'Montagem e elementos em destaque'}] as const;

export default function AdminAssistant(){
 const {user}=useAuth();const {roles,loading:rolesLoading}=useUnitRoles();const {businessUnitId,units,loading:unitsLoading}=useCurrentBusinessUnit();
 const location=useLocation(),navigate=useNavigate();
 const pagePath=location.pathname+location.search;const currentPage=findAgentPage(pagePath);
 const unitScope=`${user?.id??''}:${businessUnitId??''}`;
 const scope=`${unitScope}:${pagePath}:${roles.slice().sort().join(',')}`;
 const current=useRef(scope);current.current=scope;
 const generation=useRef({scope,version:0});if(generation.current.scope!==scope)generation.current={scope,version:generation.current.version+1};
 const allowed=Boolean(user&&businessUnitId&&!unitsLoading&&!rolesLoading&&canAccessAgentPage(roles,currentPage));
 const accessibleTutorials=TUTORIALS.filter(t=>canAccessAgentPage(roles,findAgentPage(t.page)));
 const [open,setOpen]=useState(false);const [tab,setTab]=useState<'task'|'tutorials'|'guided'>('task');
 const [draftState,setDraftState]=useState<{scope:string;fields:typeof emptyGuided;step:number}>({scope:'',fields:emptyGuided,step:0});
 const guided=draftState.scope===unitScope?draftState.fields:emptyGuided;
 const guidedStep=draftState.scope===unitScope?draftState.step:0;
 const setGuided=(update:typeof emptyGuided|((current:typeof emptyGuided)=>typeof emptyGuided))=>setDraftState(previous=>{const active=previous.scope===unitScope?previous:{scope:unitScope,fields:emptyGuided,step:0};return {...active,scope:unitScope,fields:typeof update==='function'?update(active.fields):update};});
 const setGuidedStep=(update:number|((current:number)=>number))=>setDraftState(previous=>{const active=previous.scope===unitScope?previous:{scope:unitScope,fields:emptyGuided,step:0};return {...active,scope:unitScope,step:typeof update==='function'?update(active.step):update};});
 const [modelState,setModelState]=useState<{scope:string;models:Model[];warning:string;loading:boolean}>({scope:'',models:[],warning:'',loading:false});
 const [model,setModel]=useState('');const [promptState,setPromptState]=useState<{scope:string;value:string}>({scope:'',value:''});
 const taskPrompt=promptState.scope===scope?promptState.value:'';
 const setTaskPrompt=(value:string)=>setPromptState({scope,value});
 const [task,setTask]=useState<AsyncState<AgentTaskPlan>>({scope:'',value:null,error:'',busy:false});
 const [tutorialId,setTutorialId]=useState(accessibleTutorials[0]?.id??'menu');const [tutorialStep,setTutorialStep]=useState(0);const [attempt,setAttempt]=useState(0);
 const end=useRef<HTMLDivElement>(null);const sending=useRef(false);
 const visibleTask=task.scope===scope?task:{scope,value:null,error:'',busy:false};
 const available=modelState.scope===scope?modelState:{scope,models:[],warning:'',loading:true};
 const unitName=units.find(u=>u.id===businessUnitId)?.name??'Unidade selecionada';
 const tutorial=accessibleTutorials.find(t=>t.id===tutorialId)??accessibleTutorials[0];
 const currentRole=roles.filter(role=>currentPage?.roles.includes(role as never)).map(role=>roleLabels[role]??role).join(' / ');
 useEffect(()=>{setPromptState({scope,value:''});setModel('');setOpen(false);sending.current=false;setTask({scope,value:null,error:'',busy:false});},[scope]);
 useEffect(()=>{setDraftState({scope:unitScope,fields:emptyGuided,step:0});},[unitScope]);
 useEffect(()=>{if(!allowed)setOpen(false);},[allowed]);
 useEffect(()=>{
  if(!allowed||!open)return;let disposed=false;
  setModelState({scope,models:[],warning:'',loading:true});
  void invoke({action:'models',businessUnitId,page:pagePath}).then(data=>{
   if(disposed||current.current!==scope)return;
   const models=Array.isArray(data.models)?data.models as Model[]:[];
   setModelState({scope,models,warning:(data.warnings??[]).join(' '),loading:false});
   setModel(prev=>models.some(m=>m.id===prev)?prev:models[0]?.id??'');
  }).catch(e=>{if(!disposed&&current.current===scope)setModelState({scope,models:[],warning:e instanceof Error?e.message:'Falha ao consultar modelos',loading:false});});
  return ()=>{disposed=true;};
 },[allowed,open,businessUnitId,pagePath,scope,attempt]);
 useEffect(()=>{if(open&&tab==='task')end.current?.scrollIntoView({block:'nearest'});},[visibleTask.value,visibleTask.busy,open,tab]);
 async function runTask(){
  const prompt=taskPrompt.trim();if(!prompt||visibleTask.busy||sending.current||!allowed||!currentPage||!available.models.some(m=>m.id===model))return;
  const requestScope=scope;const requestVersion=generation.current.version;
  sending.current=true;setTask({scope:requestScope,value:null,error:'',busy:true});
  try{
   const data=await invoke({action:'agent-plan',businessUnitId,model,prompt,page:pagePath,requestId:crypto.randomUUID()});
   if(current.current!==requestScope||generation.current.version!==requestVersion)return;
   const plan=validateAgentPlan(data.plan,roles,currentPage);
   setTask({scope:requestScope,value:plan,error:'',busy:false});
   if(plan.action==='navigate'&&plan.routeId!==currentPage.id){
    const target=AGENT_PAGES.find(page=>page.id===plan.routeId);
    if(target&&canAccessAgentPage(roles,target)){toast.info(`Abrindo ${target.label}`,{description:plan.explanation});setOpen(false);navigate(target.path);}
   }
  }catch(error){if(current.current===requestScope&&generation.current.version===requestVersion)setTask({scope:requestScope,value:null,error:error instanceof Error?error.message:'Falha ao preparar a tarefa',busy:false});}
  finally{if(current.current===requestScope&&generation.current.version===requestVersion)sending.current=false;}
 }
 function openPlannedPage(plan:AgentTaskPlan){
  const target=AGENT_PAGES.find(page=>page.id===plan.routeId);
  if(!target||!canAccessAgentPage(roles,target))return;
  setOpen(false);navigate(target.path);
 }
 function applyMenuDraft(plan:AgentTaskPlan){
  if(plan.action!=='draft'||plan.formId!=='menu-guided')return;
  setGuided(value=>({...value,...plan.fields}));setGuidedStep(0);setTab('guided');
 }
 async function copyGuidedDraft(){
  const summary=guidedFields.map(field=>`${field.label}: ${guided[field.key]||'A definir'}`).join('\n');
  try{await navigator.clipboard.writeText(summary);}catch{setTask({scope,value:null,error:'Não foi possível copiar o rascunho neste navegador.',busy:false});setTab('task');}
 }
 if(!allowed)return null;
 return <>
  <Button className="fixed bottom-4 right-4 z-40 gap-2 rounded-full shadow-lg" aria-label="Abrir agente PØP9" data-tooltip="Peça uma tarefa, abra módulos permitidos ou consulte instruções." onClick={()=>setOpen(true)}><Sparkles className="h-5 w-5"/><span className="hidden sm:inline">Agente PØP9</span></Button>
  <Dialog open={open} onOpenChange={setOpen}>
   <DialogContent className="flex h-[min(760px,92dvh)] w-[calc(100%-1rem)] max-w-2xl flex-col gap-3 p-4 sm:p-6">
    <DialogHeader><DialogTitle>Agente PØP9</DialogTitle><DialogDescription>{unitName} · {currentRole||'Acesso autorizado'} · {currentPage?.label}</DialogDescription></DialogHeader>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modo do agente"><Button role="tab" aria-selected={tab==='task'} variant={tab==='task'?'default':'outline'} onClick={()=>setTab('task')}><Navigation className="mr-2 h-4 w-4"/>Tarefa</Button><Button role="tab" aria-selected={tab==='tutorials'} variant={tab==='tutorials'?'default':'outline'} onClick={()=>setTab('tutorials')}><BookOpen className="mr-2 h-4 w-4"/>Instruções</Button><Button role="tab" aria-selected={tab==='guided'} variant={tab==='guided'?'default':'outline'} onClick={()=>setTab('guided')}>Rascunho de cardápio</Button></div>
    {tab==='task'?<div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
     <p className="text-sm">Descreva uma tarefa em uma solicitação. O agente sugere a página correta e explica o próximo passo; nesta versão, ele não executa gravações.</p>
     <label className="block space-y-1 text-sm">Modelo<select aria-label="Modelo do agente" className="w-full rounded-md border bg-background p-2" value={model} disabled={available.loading||visibleTask.busy} onChange={event=>setModel(event.target.value)}>{!available.models.length&&<option value="">{available.loading?'Verificando IA...':'IA indisponível'}</option>}{available.models.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
     {!available.loading&&(!available.models.length||available.warning)&&<div role="status" className="space-y-2 rounded-md border p-3 text-sm"><p>{available.warning||'Conecte um provedor de IA em Conexões. As instruções locais continuam disponíveis.'}</p>{roles.includes('admin')&&<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>{setOpen(false);navigate('/admin?sec=connections');}}>Configurar IA</Button><Button size="sm" variant="outline" onClick={()=>setAttempt(value=>value+1)}>Verificar novamente</Button></div>}</div>}
     <form className="space-y-2" onSubmit={event=>{event.preventDefault();void runTask();}}><label className="block space-y-1 text-sm">O que você precisa fazer?<Textarea aria-label="Descreva a tarefa" placeholder="Ex.: abrir o Estoque e explicar como registrar uma compra" value={taskPrompt} maxLength={4000} disabled={visibleTask.busy} onChange={event=>{setTaskPrompt(event.target.value);setTask({scope,value:null,error:'',busy:false});}} className="min-h-24 max-h-40"/></label><Button type="submit" className="gap-2" disabled={!taskPrompt.trim()||visibleTask.busy||!model||available.loading}>{visibleTask.busy?<><Loader2 className="h-4 w-4 animate-spin"/>Preparando a tarefa...</>:<><Sparkles className="h-4 w-4"/>Analisar tarefa</>}</Button></form>
     {visibleTask.error&&<p role="alert" className="text-sm text-destructive">{visibleTask.error}</p>}
     {visibleTask.value&&<section className="space-y-3 rounded-lg border bg-muted/30 p-3" aria-label="Proposta do agente"><h3 className="font-semibold">Proposta para revisão</h3><p className="whitespace-pre-wrap text-sm">{visibleTask.value.explanation||'Tarefa preparada.'}</p>{visibleTask.value.missing.length>0&&<div className="text-sm"><p className="font-medium">Informações ainda necessárias</p><ul className="ml-5 list-disc">{visibleTask.value.missing.map(item=><li key={item}>{item}</li>)}</ul></div>}{visibleTask.value.action==='draft'&&<div className="space-y-2 rounded-md border bg-background p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rascunho local · não salvo</p>{guidedFields.filter(field=>visibleTask.value?.fields[field.key]).map(field=><div key={field.key} className="grid gap-1 border-b pb-2 last:border-0 sm:grid-cols-[11rem_1fr]"><span className="text-xs font-medium">{field.label}</span><span className="whitespace-pre-wrap break-words text-sm">{visibleTask.value?.fields[field.key]}</span></div>)}<Button type="button" variant="outline" onClick={()=>applyMenuDraft(visibleTask.value!)}>Aplicar ao rascunho local</Button></div>}{visibleTask.value.action!=='draft'&&<Button type="button" onClick={()=>openPlannedPage(visibleTask.value!)}><Navigation className="mr-2 h-4 w-4"/>Abrir {AGENT_PAGES.find(page=>page.id===visibleTask.value?.routeId)?.label??'área'}</Button>}</section>}
     <p ref={end} className="text-xs text-muted-foreground">A proposta é revisável e não grava nada. Trocar de unidade ou página descarta a tarefa. O modelo recebe o pedido, a página atual e uma lista de rotas; não recebe dados de clientes, caixa ou estoque nesta etapa.</p>
    </div>:tab==='guided'?<div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4"><p className="text-sm text-muted-foreground">Formulário guiado · etapa {guidedStep+1} de {guidedFields.length}. Rascunho local, sem gravação nem movimentação de estoque.</p><progress className="w-full accent-primary" max={guidedFields.length} value={guidedStep+1}/><label className="block space-y-2 text-sm font-medium">{guidedFields[guidedStep].label}<Textarea aria-label={guidedFields[guidedStep].label} placeholder={guidedFields[guidedStep].hint} value={guided[guidedFields[guidedStep].key]} onChange={event=>setGuided(value=>({...value,[guidedFields[guidedStep].key]:event.target.value}))}/></label><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={guidedStep===0} onClick={()=>setGuidedStep(step=>step-1)}>Anterior</Button><Button disabled={guidedStep===guidedFields.length-1} onClick={()=>setGuidedStep(step=>step+1)}>Próximo</Button><Button variant="outline" disabled={!available.models.length||available.loading} onClick={()=>{const summary=guidedFields.map(field=>`${field.label}: ${guided[field.key]||'A definir'}`).join('\n');setTaskPrompt(`Revise este rascunho de cardápio da unidade ${unitName}. Identifique lacunas e pontos que preciso conferir; não invente preços ou saldos.\n\n${summary}`);setTab('task');}}>Revisar tarefa com IA</Button><Button variant="outline" onClick={()=>void copyGuidedDraft()}>Copiar rascunho</Button></div><p className="text-xs text-muted-foreground">Este rascunho ainda não preenche o cadastro nem salva no ERP. Revise e cadastre no Cardápio.</p><Button variant="outline" onClick={()=>openPlannedPage({action:'navigate',routeId:'menu',formId:null,fields:{},explanation:'',missing:[]})}>Abrir Cardápio</Button></div>:<div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
     <p className="text-sm text-muted-foreground">Instruções locais passo a passo. Disponíveis sem conexão à IA e filtradas pelo seu perfil.</p>{tutorial?<><label className="block space-y-1 text-sm">Módulo<select aria-label="Escolher instrução" className="w-full rounded-md border bg-background p-2" value={tutorial.id} onChange={event=>{setTutorialId(event.target.value);setTutorialStep(0);}}>{accessibleTutorials.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="space-y-4 rounded-xl border p-4"><h3 className="font-semibold">{tutorial.title}</h3><p className="text-xs text-muted-foreground">Passo {tutorialStep+1} de {tutorial.steps.length}</p><progress aria-label="Progresso das instruções" className="h-2 w-full accent-primary" max={tutorial.steps.length} value={tutorialStep+1}/><p className="text-sm leading-relaxed">{tutorial.steps[tutorialStep]}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={tutorialStep===0} onClick={()=>setTutorialStep(step=>step-1)}>Anterior</Button>{tutorialStep<tutorial.steps.length-1?<Button onClick={()=>setTutorialStep(step=>step+1)}>Próximo passo</Button>:<Button onClick={()=>setTutorialStep(0)}>Recomeçar</Button>}<Button variant="outline" onClick={()=>{setOpen(false);navigate(tutorial.page);}}>Abrir área</Button></div></div><details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Ver todos os passos</summary><ol className="ml-5 mt-3 list-decimal space-y-3">{tutorial.steps.map((step,index)=><li key={index}>{step}</li>)}</ol></details></>:<p role="status" className="text-sm">Não há instruções para este perfil.</p>}
    </div>}
   </DialogContent>
  </Dialog>
 </>;
}
