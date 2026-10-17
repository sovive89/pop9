/** Execute with a private fixture JSON path; never store credentials in the repo. */
import { readFile, writeFile } from 'node:fs/promises';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
if(!input.ref || input.ref==='dtpuvegtcgddjkifsocx' || input.environment!=='isolated-staging') throw new Error('Only isolated staging is accepted');
const base=`https://${input.ref}.supabase.co`;
const results=[];
const tokens=new Map();
async function api(account,table,query){
 const headers={apikey:input.anonKey};if(account)headers.Authorization=`Bearer ${tokens.get(account)}`;
 const response=await fetch(`${base}/rest/v1/${table}?${query}`,{headers});
 const data=await response.json();return {status:response.status,data};
}
async function record(id,account,table,query,expected,check){
 const response=await api(account,table,query);
 const passed=check(response);
 results.push({id,account:account??'anon',table,query,expected,status:response.status,returnedIds:Array.isArray(response.data)?response.data.map(row=>row.id):[],errorCode:response.data?.code??null,errorMessage:response.data?.message??null,result:passed?'passed':'failed',timestamp:new Date().toISOString()});
 await writeFile(process.argv[3],JSON.stringify({environment:input.environment,ref:input.ref,schema:input.schema,results,stopped:!passed},null,2));
 if(!passed)throw new Error(`Security gate failed: ${id}, ${account}, ${table}; no further tests executed`);
}
for(const account of input.accounts){
 const response=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:input.anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});
 const data=await response.json();if(!response.ok||!data.access_token)throw new Error(`Login failed for synthetic account ${account.label}: HTTP ${response.status}`);
 tokens.set(account.label,data.access_token);
}
const visible=r=>r.status===200&&Array.isArray(r.data)&&r.data.length===1;
const hidden=r=>(r.status===200&&Array.isArray(r.data)&&r.data.length===0)||[401,403].includes(r.status);
for(const role of ['admin-a','cashier-a','attendant-a']){
 await record('RLS-01',role,'sessions',`select=id&id=eq.${input.sessionA}`,'own fixture visible',visible);
 await record('RLS-02',role,'sessions',`select=id&id=eq.${input.sessionB}`,'other unit hidden',hidden);
}
await record('RLS-14','no-role','sessions',`select=id&id=eq.${input.sessionA}`,'no role hidden',hidden);
await record('RLS-15',null,'sessions',`select=id&id=eq.${input.sessionA}`,'anonymous hidden',hidden);
for(const role of ['admin-a','attendant-a']){
 await record('RLS-12',role,'business_units',`select=id&id=eq.${input.unitB}`,'other unit hidden',hidden);
 await record('RLS-12',role,'dining_tables',`select=id&id=eq.${input.tableB}`,'other unit table hidden',hidden);
}
console.log(`Read gate passed: ${results.length} API checks. Writes and closure scenarios are not covered by this runner.`);
