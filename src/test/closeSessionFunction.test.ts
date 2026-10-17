// @vitest-environment node
import {readFileSync} from "node:fs";
import ts from "typescript";
import {describe,expect,it,vi} from "vitest";
const source=readFileSync("supabase/functions/close-session/index.ts","utf8").replace(/^import .*createClient.*;\r?\n/m,"");
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const SESSION="00000000-0000-0000-0000-000000000021";
function endpoint(options:{passwordError?:boolean;allowed?:boolean;authError?:boolean;rpcError?:boolean;proofUser?:string}={}){
  const rpc=vi.fn().mockResolvedValue(options.rpcError ? {data:null,error:{message:"justificativa obrigatória",code:"P0001"}} : {data:{closed:true,unpaidTotal:0},error:null});
  const proof=vi.fn().mockResolvedValue({data:{user:{id:options.proofUser ?? "cashier"}},error:options.passwordError ? {message:"wrong"} : null});
  const signOut=vi.fn().mockResolvedValue({error:null});
  const auth={auth:{getUser:async()=>({data:{user:{id:"cashier",email:"cashier@example.test"}},error:options.authError ? {message:"expired"} : null}),signInWithPassword:proof,signOut}};
  const admin={rpc,from:(table:string)=>{
    const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{business_unit_id:"unit"},error:null}),in:async()=>({data:options.allowed===false ? [] : [{role:table==="user_roles" ? "cashier" : "admin"}],error:null})};return query;
  }};
  const createClient=vi.fn((_url:string,key:string)=>key==="service" ? admin : auth);
  let handler!:(req:Request)=>Promise<Response>;
  new Function("createClient","Deno",code)(createClient,{env:{get:(key:string)=>key==="SUPABASE_SERVICE_ROLE_KEY" ? "service" : key==="SUPABASE_ANON_KEY" ? "anon" : "https://test"},serve:(fn:typeof handler)=>{handler=fn;}});
  return {rpc,proof,signOut,createClient,invoke:(body:Record<string,unknown>={})=>handler(new Request("https://test",{method:"POST",headers:{Authorization:"Bearer valid","Content-Type":"application/json"},body:JSON.stringify({session_id:SESSION,password:"Senha!123",...body})}))};
}
describe("server password gate for cashier closure",()=>{
  it("does not close or check a password when the caller has no cashier role in the unit",async()=>{
    const api=endpoint({allowed:false});expect((await api.invoke()).status).toBe(403);expect(api.proof).not.toHaveBeenCalled();expect(api.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid tokens and wrong passwords without mutating the table",async()=>{
    const expired=endpoint({authError:true});expect((await expired.invoke()).status).toBe(401);expect(expired.rpc).not.toHaveBeenCalled();
    const wrong=endpoint({passwordError:true});expect((await wrong.invoke()).status).toBe(403);expect(wrong.rpc).not.toHaveBeenCalled();
  });
  it("binds password proof to the authenticated cashier",async()=>{
    const api=endpoint({proofUser:"other-user"});expect((await api.invoke()).status).toBe(403);expect(api.rpc).not.toHaveBeenCalled();
  });
  it("uses the service client only after proof and passes the authenticated actor, ignoring forged caller ids",async()=>{
    const api=endpoint();const response=await api.invoke({actor_id:"admin-forged",justification:"Cliente saiu sem pagar"});
    expect(response.status).toBe(200);expect(api.rpc).toHaveBeenCalledWith("approve_session_closure",{p_session_id:SESSION,p_actor_id:"cashier",p_justification:"Cliente saiu sem pagar"});
    expect(api.signOut).toHaveBeenCalledWith({scope:"local"});expect(api.createClient).toHaveBeenCalledWith("https://test","service",{auth:{persistSession:false,autoRefreshToken:false}});
  });
  it("returns current balance blockers and still discards the password-proof session",async()=>{
    const api=endpoint({rpcError:true});const response=await api.invoke();expect(response.status).toBe(409);expect((await response.json()).error).toContain("justificativa");expect(api.signOut).toHaveBeenCalledOnce();
  });
});
