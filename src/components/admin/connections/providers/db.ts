import {manageOperational} from "@/hooks/useOperationalIntegrations";
import {supabase} from "@/integrations/supabase/client";
import type {IntegrationRecord,IntegrationStatus} from "../types";
function mapRow(row:Record<string,unknown>):IntegrationRecord{return {id:row.id as string,businessUnitId:row.business_unit_id as string|null,provider:row.provider as string,status:row.status as IntegrationStatus,config:(row.config ?? {}) as Record<string,unknown>,connectedAt:row.connected_at as string|null,lastSyncAt:row.last_sync_at as string|null,errorMessage:row.error_message as string|null,createdAt:row.created_at as string,updatedAt:row.updated_at as string};}
export async function loadAllIntegrationRecords(unit:string|null):Promise<{records:IntegrationRecord[];error:string|null}>{
  if(!unit)return {records:[],error:null};
  const {data,error}=await supabase.from("integrations").select("*").eq("business_unit_id",unit);
  return {records:(data ?? []).map(mapRow),error:error?.message ?? null};
}
export async function getIntegrationRecord(provider:string,unit:string|null){
  if(!unit)return null;const {data,error}=await supabase.from("integrations").select("*").eq("provider",provider).eq("business_unit_id",unit).maybeSingle();
  if(error)throw error;return data ? mapRow(data) : null;
}
export async function upsertIntegrationRecord(provider:string,unit:string|null,patch:Partial<{status:IntegrationStatus;config:Record<string,unknown>;connectedAt:string|null;lastSyncAt:string|null;errorMessage:string|null}>){
  if(!unit)throw Error("Selecione a unidade");
  await manageOperational({business_unit_id:unit,provider,action:patch.status==="DISCONNECTED" ? "disconnect" : "save",config:patch.config ?? {}});
}
