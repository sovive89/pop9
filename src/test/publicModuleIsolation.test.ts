// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import * as operational from "../../supabase/functions/_shared/operational";
import * as brand from "../../supabase/functions/_shared/brand";
import * as twilio from "../../supabase/functions/_shared/twilio";
import { parseCheckinRequest } from "../../supabase/functions/_shared/checkin-request";

const publicHelpers = { ...operational, ...brand, ...twilio };
const UNIT = "00000000-0000-0000-0000-000000000001";
const OTHER_UNIT = "00000000-0000-0000-0000-000000000002";

type ModuleState = { qrDisabled?: boolean; pwaDisabled?: boolean; qrUnit?: string; unitLookupError?: boolean; qrLookupError?: boolean };
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (key: string, value: unknown) => Query;
  in: (...args: unknown[]) => Query;
  is: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  limit: (value: number) => Query;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
};

function makeQuery(table: string, state: ModuleState, filters: Record<string, unknown> = {}): Query {
  const query = {} as Query;
  const result = () => {
    if (table === "business_units") {
      if (state.unitLookupError) return { data: null, error: { code: "PGRST500" } };
      const id = filters.id as string | undefined;
      if (id && id !== UNIT && id !== OTHER_UNIT) return { data: null, error: null };
      const unit = id ?? UNIT;
      return { data: { id: unit, name: unit === UNIT ? "Loja" : "Outra loja", active: true, disabled_modules: [
        ...(unit === (state.qrUnit ?? UNIT) && state.qrDisabled ? ["autoatendimento_qr"] : []),
        ...(unit === UNIT && state.pwaDisabled ? ["pwa_publica"] : []),
      ] }, error: null };
    }
    if (table === "integrations") {
      const provider = filters.provider;
      if (provider === "own-pwa") return { data: { provider, status: "CONNECTED", config: { enabled: true, publicOrigin: "https://loja.com" } }, error: null };
      if (provider === "twilio") return { data: null, error: null };
      return { data: { config: { businessPhone: "5511999999999" } }, error: null };
    }
    if (table === "table_qr_codes") {
      if (state.qrLookupError) return { data: null, error: { code: "PGRST500" } };
      const token = filters.token;
      if (token !== "qr-unit-1" && token !== "qr-other-unit") return { data: null, error: null };
      return { data: { token, table_number: token === "qr-unit-1" ? 12 : 7, business_unit_id: token === "qr-unit-1" ? UNIT : OTHER_UNIT, active: true }, error: null };
    }
    if (table === "app_config") return { data: { value: "true" }, error: null };
    if (table === "sessions") return { data: null, error: null };
    if (table === "operation_periods") return { data: { id: "period" }, error: null };
    if (table === "menu_items") return { data: [{ id: "burger", name: "Burger", description: "Clássico", price: 25, image_url: null, category: "burgers" }], error: null };
    if (table === "menu_item_ingredients") return { data: [{ id: "00000000-0000-0000-0000-000000000101", menu_item_id: "burger", name: "Bacon", removable: true, extra_price: 4, sort_order: 0 }], error: null };
    if (table === "menu_item_variants") return { data: [{ id: "00000000-0000-0000-0000-000000000102", menu_item_id: "burger", name: "Duplo", sort_order: 0 }], error: null };
    if (table === "brand_settings") return { data: null, error: null };
    if (table === "user_roles") return { data: null, error: null };
    return { data: [], error: null };
  };
  query.select = () => query;
  query.eq = (key, value) => { filters[key] = value; return query; };
  query.in = () => query;
  query.is = () => query;
  query.order = () => query;
  query.limit = () => query;
  query.maybeSingle = async () => result();
  query.single = async () => result();
  query.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
  return query;
}

function publicOrder(state: ModuleState, rpc: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: [], error: null })) {
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/public-order/index.ts", "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const db = { from: (table: string) => makeQuery(table, state), rpc };
  new Function(...Object.keys(publicHelpers), "createClient", "Deno", code)(
    ...Object.values(publicHelpers),
    () => db,
    { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://project.supabase.co" : "service" }, serve: (fn: typeof handler) => { handler = fn; } },
  );
  return (body: unknown, raw = false) => handler(new Request("https://project.supabase.co/functions/v1/public-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) }));
}

function customerCheckin(state: ModuleState) {
  let handler!: (request: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/customer-checkin/index.ts", "utf8").replace(/^import[\s\S]*?;\r?\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const db = { from: (table: string) => makeQuery(table, state) };
  new Function("parseCheckinRequest", "createClient", "Deno", code)(parseCheckinRequest, () => db, { env: { get: () => "service" }, serve: (fn: typeof handler) => { handler = fn; } });
  return (body: unknown) => handler(new Request("https://project.supabase.co/functions/v1/customer-checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

async function json(response: Response) { return response.json() as Promise<Record<string, unknown>>; }

describe("isolamento dos módulos públicos", () => {
  it.each([
    { name: "somente QR", qrDisabled: false, pwaDisabled: true, qrEnabled: true, pwaStatus: 404 },
    { name: "somente PWA", qrDisabled: true, pwaDisabled: false, qrEnabled: false, pwaStatus: 200 },
    { name: "QR e PWA", qrDisabled: false, pwaDisabled: false, qrEnabled: true, pwaStatus: 200 },
    { name: "ambos desligados", qrDisabled: true, pwaDisabled: true, qrEnabled: false, pwaStatus: 404 },
  ])("mantém $name isolado", async ({ qrDisabled, pwaDisabled, qrEnabled, pwaStatus }) => {
    const state = { qrDisabled, pwaDisabled };
    const qrResponse = await customerCheckin(state)({ action: "get_table_info", token: "qr-unit-1" });
    const qrBody = await json(qrResponse);
    expect(qrResponse.status).toBe(200);
    expect(qrBody.enabled).toBe(qrEnabled);
    const pwaResponse = await publicOrder(state)({ action: "menu", business_unit_id: UNIT });
    expect(pwaResponse.status).toBe(pwaStatus);
  });

  it("falha fechado quando o QR pertence a outra unidade", async () => {
    const response = await customerCheckin({ qrDisabled: true, qrUnit: OTHER_UNIT })({ action: "get_table_info", token: "qr-other-unit" });
    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body.enabled).toBe(false);
  });

  it("não libera o PWA com token de acesso quando o módulo está desligado", async () => {
    const response = await publicOrder({ pwaDisabled: true })({ action: "submit", business_unit_id: UNIT, access_token: "a".repeat(72), items: [{ id: "burger", quantity: 1 }] });
    expect(response.status).toBe(404);
  });

  it("entrega somente adicionais e variantes pertencentes aos itens publicados", async () => {
    const response = await publicOrder({});
    const body = await json(await response({ action: "menu", business_unit_id: UNIT }));
    expect(body.items).toEqual([expect.objectContaining({
      id: "burger",
      ingredients: [{ id: "00000000-0000-0000-0000-000000000101", name: "Bacon", removable: true, extra_price: 4 }],
      variants: [{ id: "00000000-0000-0000-0000-000000000102", name: "Duplo" }],
    })]);
  });

  it("mantém o status de pedido existente com o PWA desligado, mas bloqueia menu e novos pedidos", async () => {
    const api = publicOrder({ pwaDisabled: true }, async () => ({ data: { status: "preparing" }, error: null }));
    const status = await api({ action: "status", business_unit_id: UNIT, access_token: "a".repeat(72) });
    expect(status.status).toBe(200);
    expect((await api({ action: "menu", business_unit_id: UNIT })).status).toBe(404);
    expect((await api({ action: "submit", business_unit_id: UNIT, access_token: "a".repeat(72), items: [{ id: "burger", quantity: 1 }] })).status).toBe(404);
  });

  it("não expõe status em unidade inativa ou inexistente", async () => {
    const response = await publicOrder({})({ action: "status", business_unit_id: "00000000-0000-0000-0000-000000000099", access_token: "a".repeat(72) });
    expect(response.status).toBe(404);
  });

  it("falha fechado quando a unidade não pode ser consultada", async () => {
    const pwaResponse = await publicOrder({ unitLookupError: true })({ action: "menu", business_unit_id: UNIT });
    expect(pwaResponse.status).not.toBe(200);

    const qrResponse = await customerCheckin({ qrLookupError: true })({ action: "get_table_info", token: "qr-unit-1" });
    expect(qrResponse.status).not.toBe(200);
  });

  it("separa JSON inválido (400) de falha interna (500) sem vazar detalhes", async () => {
    const handlerOf = publicOrder({});
    const invalid = await handlerOf("{ não é json", true);
    expect(invalid.status).toBe(400);

    const failing = publicOrder({}, async () => { throw new Error("connection refused: postgres://secret"); });
    const response = await failing({ action: "submit", business_unit_id: UNIT, access_token: "a".repeat(72), items: [{ id: "burger", quantity: 1 }] });
    const body = await json(response);
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("postgres");
    expect(typeof body.request_id).toBe("string");
  });
});
