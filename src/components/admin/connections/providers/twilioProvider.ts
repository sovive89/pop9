import {getIntegrationRecord} from "./db";
import {manageOperational} from "@/hooks/useOperationalIntegrations";
import type {IntegrationProvider} from "./types";
const SECRETS=["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_VERIFY_SERVICE_SID"];
// Twilio Verify: as chaves ficam nos Secrets do Supabase; a tela só liga/desliga e valida.
export const twilioProvider:IntegrationProvider={
  slug:"twilio",
  async getStatus(unit){const record=await getIntegrationRecord("twilio",unit);return {status:record?.status ?? "NOT_CONNECTED",config:record?.config ?? {}};},
  async saveConfig(unit,config){await manageOperational({business_unit_id:unit,provider:"twilio",action:"save",config:{enabled:config.enabled!==false}});},
  async testConnection(unit){
    const health=await manageOperational({business_unit_id:unit,action:"health"}) as {readiness?:Record<string,boolean>};
    const missing=SECRETS.filter(name=>!health.readiness?.[name]);
    return missing.length ? {ok:false,message:`Faltam no servidor: ${missing.join(", ")}`} : {ok:true,message:"As três chaves do Twilio estão no servidor."};
  },
  async connect(unit){const result=await manageOperational({business_unit_id:unit,provider:"twilio",action:"connect",config:{enabled:true}});if(!result.success)throw Error(result.message);},
  async disconnect(unit){await manageOperational({business_unit_id:unit,provider:"twilio",action:"disconnect"});},
};
