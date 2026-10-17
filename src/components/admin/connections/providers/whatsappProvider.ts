import {getIntegrationRecord,upsertIntegrationRecord} from "./db";
import {manageOperational} from "@/hooks/useOperationalIntegrations";
import type {IntegrationProvider} from "./types";
export const whatsappProvider:IntegrationProvider={
  slug:"whatsapp",
  async getStatus(unit){const record=await getIntegrationRecord("whatsapp",unit);return {status:record?.status ?? "NOT_CONNECTED",config:record?.config ?? {}};},
  async saveConfig(unit,config){await upsertIntegrationRecord("whatsapp",unit,{config});},
  async connect(unit,config){const result=await manageOperational({business_unit_id:unit,provider:"whatsapp",action:"connect",config});if(!result.success)throw Error(result.message);},
  async disconnect(unit){await upsertIntegrationRecord("whatsapp",unit,{status:"DISCONNECTED"});}
};
