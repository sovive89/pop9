import {useCallback,useEffect,useRef,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {useCurrentBusinessUnit} from "@/hooks/useCurrentBusinessUnit";
import {useAuth} from "@/hooks/useAuth";
export type OperationalConfig={publicOrigin?:string;enabled?:boolean;phoneNumberId?:string;businessPhone?:string;graphVersion?:string;botMode?:string;botWebhookUrl?:string;welcomeMessage?:string};
export type OperationalRecord={provider:string;config:OperationalConfig;status:string;last_sync_at:string|null;error_message:string|null};
type Health={integrations:OperationalRecord[];readiness:Record<string,boolean>;webhookUrl:string};
export async function manageOperational(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke("manage-operational-integrations",{body});
  if(error){let message="Não foi possível acessar o serviço de integrações";if(error.context instanceof Response){try{message=(await error.context.json()).error ?? message;}catch{/* fallback */}}throw Error(message);}
  if(data?.error)throw Error(data.error);return data;
}
export function useOperationalIntegrations(){
  const {businessUnitId}=useCurrentBusinessUnit();const {user}=useAuth();const scope=`${user?.id}:${businessUnitId}`;
  const latest=useRef(scope);latest.current=scope;
  const [state,setState]=useState<{scope:string;data:Health|null;error:string;loading:boolean}>({scope,data:null,error:"",loading:true});
  const reload=useCallback(async()=>{
    if(!user || !businessUnitId){setState({scope,data:null,error:"",loading:false});return;}
    setState({scope,data:null,error:"",loading:true});
    try{const data=await manageOperational({action:"health",business_unit_id:businessUnitId}) as Health;if(latest.current===scope)setState({scope,data,error:"",loading:false});}
    catch(error){if(latest.current===scope)setState({scope,data:null,error:error instanceof Error ? error.message : "Falha de conexão",loading:false});}
  },[scope,user,businessUnitId]);
  useEffect(()=>{void reload();},[reload]);
  const visible=state.scope===scope ? state : {data:null,error:"",loading:true};
  return {businessUnitId,scope,...visible,reload};
}
