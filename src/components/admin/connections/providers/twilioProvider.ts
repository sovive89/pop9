import {getIntegrationRecord} from "./db";
import {manageOperational} from "@/hooks/useOperationalIntegrations";
import type {IntegrationProvider} from "./types";
const SECRETS=["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_VERIFY_SERVICE_SID"];
const pick=(config:Record<string,unknown>)=>({enabled:config.enabled!==false,accountSid:config.accountSid ?? "",authToken:config.authToken ?? "",verifyServiceSid:config.verifyServiceSid ?? ""});
// Twilio Verify: credenciais digitadas em Conexões e guardadas criptografadas no Vault da unidade.
export const twilioProvider:IntegrationProvider={
  slug:"twilio",
  async getStatus(unit){const record=await getIntegrationRecord("twilio",unit);return {status:record?.status ?? "NOT_CONNECTED",config:record?.config ?? {}};},
  // Os campos vão só para a função do servidor, que guarda no Vault; nada é gravado direto na tabela.
  async saveConfig(unit,config){const result=await manageOperational({business_unit_id:unit,provider:"twilio",action:"save",config:pick(config)});if(result.success===false)throw Error(result.message);},
  async testConnection(unit){
    const health=await manageOperational({business_unit_id:unit,action:"health"}) as {readiness?:Record<string,boolean>};
    const missing=SECRETS.filter(name=>!health.readiness?.[name]);
    return missing.length ? {ok:false,message:"Credenciais do Twilio ainda não salvas nesta unidade."} : {ok:true,message:"Credenciais do Twilio salvas no servidor."};
  },
  async connect(unit,config){const result=await manageOperational({business_unit_id:unit,provider:"twilio",action:"connect",config:pick(config)});if(!result.success)throw Error(result.message);},
  async disconnect(unit){await manageOperational({business_unit_id:unit,provider:"twilio",action:"disconnect"});},
};
