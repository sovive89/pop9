export type PwaProfile={name:string|null;email:string|null;bairro:string|null;marketing:boolean};
/** Chamada pública à função pwa-verify (sem sessão do Supabase; o acesso é o código de uso único). */
export async function pwaVerifyApi<T>(body:Record<string,unknown>):Promise<T>{
  const base=import.meta.env.VITE_SUPABASE_URL;
  if(!base)throw Error("A verificação ainda não foi configurada");
  const response=await fetch(`${base}/functions/v1/pwa-verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
  const data=await response.json().catch(()=>({}));if(!response.ok || data?.error)throw Error(data?.error ?? "Não foi possível verificar agora");return data as T;
}
/** Máscara visual (11) 98765-4321; o servidor normaliza e valida. */
export function formatPhone(value:string){
  const d=value.replace(/\D/g,"").slice(0,11);
  if(d.length<=2)return d;if(d.length<=6)return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return d.length<=10 ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}` : `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}
/** Mesma regra do servidor: pelo menos nome e sobrenome (2+ letras cada), sem números. */
export function isFullName(value:string){
  const name=value.trim().replace(/\s+/g," ");
  return name.length>=5 && name.length<=80 && !/[0-9@]/.test(name) && name.split(" ").filter(word=>word.length>=2).length>=2;
}
