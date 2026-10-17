// @vitest-environment node
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
const UNIT="00000000-0000-0000-0000-000000000001",OTHER="00000000-0000-0000-0000-000000000002";
const SID="AC"+"1".repeat(32),SERVICE="VA"+"2".repeat(32),TOKEN="t".repeat(32);
let db:PGlite;
beforeAll(async()=>{
  db=new PGlite();await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create table public.business_units(id uuid primary key);
    insert into public.business_units values('${UNIT}'),('${OTHER}');
    -- Vault simulado com a mesma interface do Supabase (create_secret / update_secret / decrypted_secrets).
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret,description from vault.secrets;
    create function vault.create_secret(new_secret text,new_name text default null,new_description text default '') returns uuid language sql as $$insert into vault.secrets(name,secret,description) values(new_name,new_secret,new_description) returning id$$;
    create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null,new_description text default null) returns void language sql as $$update vault.secrets set secret=coalesce(new_secret,secret) where id=secret_id$$;
  `);
  await db.exec(readFileSync("supabase/migrations/20261017180100_twilio_vault_credentials.sql","utf8"));
},30000);
afterAll(async()=>{await db.close();});
const save=(sid=SID,token=TOKEN,service=SERVICE,unit=UNIT)=>db.query("select public.save_twilio_credentials($1,$2,$3,$4)",[unit,sid,token,service]);
const read=async(unit=UNIT)=>(await db.query<{v:Record<string,string>|null}>("select public.twilio_credentials($1) as v",[unit])).rows[0].v;
describe("credenciais do Twilio no Vault por unidade",()=>{
  it("valida o formato antes de guardar",async()=>{
    await expect(save("123")).rejects.toThrow("Account SID inválido");
    await expect(save(SID,TOKEN,"VA123")).rejects.toThrow("Verify Service SID inválido");
    await expect(save(SID,"curto")).rejects.toThrow("Auth Token");
  });
  it("guarda criptografado por unidade e mantém o token quando ele vem em branco",async()=>{
    await save();expect(await read()).toEqual({accountSid:SID,authToken:TOKEN,verifyServiceSid:SERVICE});
    const service2="VA"+"3".repeat(32);await save(SID,"",service2);
    expect(await read()).toEqual({accountSid:SID,authToken:TOKEN,verifyServiceSid:service2});
    expect(await read(OTHER)).toBeNull();
    expect(Number((await db.query<{n:string}>("select count(*) as n from vault.secrets")).rows[0].n)).toBe(1);
  });
  it("só o servidor grava e lê",async()=>{
    for(const role of ["anon","authenticated"]){
      await db.exec(`set role ${role}`);
      await expect(read()).rejects.toThrow(/permission denied/);await expect(save()).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
  });
});
