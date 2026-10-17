// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_PROVIDERS } from "../../supabase/functions/_shared/ai-providers";

function endpoint(authenticated = true) {
  const writes: Record<string, unknown>[] = [];
  const removed = vi.fn();
  const connections = ["anthropic", "google", "openai", "xai", "bfl", "ideogram"].map(provider => ({ provider, status: "connected", validated_at: null }));
  const db = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: "admin" } : null }, error: null }) }, from: (table: string) => {
    let included: string[] | null = null;
    const result = () => ({ data: table === "user_roles" ? { id: "role" } : connections.filter(connection => !included || included.includes(connection.provider)), error: null });
    const query = { select: () => query, eq: () => query, or: () => query, limit: () => query, in: (column: string, values: string[]) => { if (column === "provider") included = values; return query; }, maybeSingle: async () => result(), delete: () => { removed(); return query; }, upsert: async (value: Record<string, unknown>) => { writes.push(value); return { error: null }; }, then: (resolve: (value: unknown) => unknown, reject: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject) };
    return query;
  } };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync("supabase/functions/manage-ai-credentials/index.ts", "utf8").replace(/^import .*;\r?\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("AI_PROVIDERS", "createClient", "Deno", code)(AI_PROVIDERS, () => db, { env: { get: (key: string) => key === "AI_CREDENTIALS_ENCRYPTION_KEY" ? Buffer.alloc(32, 1).toString("base64") : "test" }, serve: (fn: typeof handler) => { handler = fn; } });
  return { writes, removed, post: (body: unknown) => handler(new Request("https://example.com/manage-ai-credentials", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) })) };
}
afterEach(() => vi.unstubAllGlobals());
describe("MVP credential provider contract", () => {
  it("rejects removed providers before contacting their APIs or changing credentials", async () => {
    const api = endpoint();const fetch = vi.fn();vi.stubGlobal("fetch", fetch);
    for (const provider of ["xai", "bfl", "ideogram", "other"]) {
      for (const action of ["connect", "disconnect"]) expect((await api.post({ action, provider, businessUnitId: "unit", apiKey: "example-key-1234" })).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();expect(api.writes).toEqual([]);expect(api.removed).not.toHaveBeenCalled();
  });
  it("lists only the three allowed providers without deleting legacy credentials", async () => {
    const api = endpoint();const response = await api.post({ action: "list", businessUnitId: "unit" });
    expect(response.status).toBe(200);expect((await response.json()).connections.map((c: { provider: string }) => c.provider)).toEqual(["anthropic", "google", "openai"]);
    expect(api.removed).not.toHaveBeenCalled();expect(api.writes).toEqual([]);
  });
  it("validates each allowed provider with its read-only API and stores an encrypted key", async () => {
    const api = endpoint();const fetch = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));vi.stubGlobal("fetch", fetch);
    for (const provider of ["anthropic", "google", "openai"]) expect((await api.post({ action: "connect", provider, businessUnitId: "unit", apiKey: "example-key-1234" })).status).toBe(200);
    expect(fetch.mock.calls.map(([url]) => new URL(url).hostname)).toEqual(["api.anthropic.com", "generativelanguage.googleapis.com", "api.openai.com"]);
    expect(fetch.mock.calls[0][1].headers["x-api-key"]).toBe("example-key-1234");expect(fetch.mock.calls[1][1].headers["x-goog-api-key"]).toBe("example-key-1234");expect(fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer example-key-1234");
    expect(api.writes).toHaveLength(3);expect(JSON.stringify(api.writes)).not.toContain("example-key-1234");expect(api.writes.every(record => record.business_unit_id === "unit" && record.status === "connected" && record.encrypted_key && record.iv)).toBe(true);
  });
  it("preserves authentication before returning configuration", async () => {
    const api = endpoint(false);expect((await api.post({ action: "list", businessUnitId: "unit" })).status).toBe(401);expect(api.writes).toEqual([]);
  });
});
