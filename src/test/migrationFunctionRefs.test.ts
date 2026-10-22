// @vitest-environment node
import {readdirSync,readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

// Pega a classe de erro do PO-001: uma migration CHAMA ops_private.x() / app_private.x() e nenhuma migration
// do repositório CRIA essa função. Os testes de banco carregam listas fixas de migrations e não notariam;
// em produção o primeiro pedido falharia com "function does not exist".
// Escopo: só os schemas internos (ops_private, app_private). `public.` mistura funções com tabelas.
const DIR="supabase/migrations";
const files=readdirSync(DIR).filter(f=>f.endsWith(".sql")).sort();
const strip=(sql:string)=>sql.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--.*$/gm,"");
const all=files.map(f=>({file:f,sql:strip(readFileSync(`${DIR}/${f}`,"utf8"))}));

const SCHEMAS="ops_private|app_private";
const defined=new Set<string>();
const relations=new Set<string>();
for(const {sql} of all){
  for(const m of sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(${SCHEMAS})\\.([a-z_0-9]+)`,"gi")))defined.add(`${m[1]}.${m[2]}`.toLowerCase());
  for(const m of sql.matchAll(new RegExp(`create\\s+(?:unlogged\\s+)?(?:table|view|materialized\\s+view|sequence|type)\\s+(?:if\\s+not\\s+exists\\s+)?(${SCHEMAS})\\.([a-z_0-9]+)`,"gi")))relations.add(`${m[1]}.${m[2]}`.toLowerCase());
}

// Chamadas: schema.nome( — descartando o que é tabela/tipo (insert into x (...), from x ...).
const calls=new Map<string,string[]>();
for(const {file,sql} of all){
  for(const m of sql.matchAll(new RegExp(`\\b(${SCHEMAS})\\.([a-z_0-9]+)\\s*\\(`,"gi"))){
    const name=`${m[1]}.${m[2]}`.toLowerCase();
    if(relations.has(name))continue;
    calls.set(name,[...(calls.get(name)??[]),file]);
  }
}

describe("migrations: toda função interna chamada é criada em alguma migration",()=>{
  it("existem migrations e funções internas para verificar (guarda contra regex quebrada)",()=>{
    expect(files.length).toBeGreaterThan(20);
    expect(defined.size).toBeGreaterThan(5);
    expect(defined.has("ops_private.resolve_pwa_order_lines")).toBe(true);
  });
  it("nenhuma chamada a ops_private/app_private fica sem definição",()=>{
    const missing=[...calls.entries()].filter(([name])=>!defined.has(name)).map(([name,where])=>`${name} (usada em ${[...new Set(where)].join(", ")})`);
    expect(missing).toEqual([]);
  });
});
