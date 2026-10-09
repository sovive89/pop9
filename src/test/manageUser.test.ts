// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/manage-user/index.ts", "utf8")
  .replace(/^import .*createClient.*;\r?\n/m, "");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const UNIT = "00000000-0000-0000-0000-000000000001";

function endpoint(roleInsertError: { message: string } | null = null) {
  const roleInsert = vi.fn().mockResolvedValue({ error: roleInsertError });
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const admin = {
    auth: { admin: { createUser, deleteUser } },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ data: table === "user_roles" ? { id: "admin-role", business_unit_id: UNIT } : { id: UNIT }, error: null }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        insert: roleInsert,
      };
      return query;
    },
  };
  const passwordClient = { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } };
  const callerClient = { auth: { getUser: async () => ({ data: { user: { id: "admin", email: "admin@example.test" } } }) } };
  const createClient = vi.fn((_url: string, key: string, options?: { global?: unknown }) =>
    key === "service" ? admin : options?.global ? callerClient : passwordClient
  );
  let handler!: (request: Request) => Promise<Response>;
  const deno = {
    env: { get: (key: string) => key === "SUPABASE_SERVICE_ROLE_KEY" ? "service" : key === "SUPABASE_ANON_KEY" ? "anon" : "https://example.test" },
    serve: (callback: typeof handler) => { handler = callback; },
  };
  new Function("createClient", "Deno", code)(createClient, deno);
  const invoke = (patch: Record<string, unknown> = {}) => handler(new Request("https://example.test/manage-user", {
    method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", admin_password: "Admin!123", full_name: "Equipe",
      cpf: "12345678901", password: "Password!123", roles: ["attendant"], business_unit_id: UNIT, ...patch }),
  }));
  return { invoke, roleInsert, createUser, deleteUser, passwordClient };
}

describe("manage-user unit assignments", () => {
  it("binds every selected role to the authorized unit", async () => {
    const api = endpoint();
    const response = await api.invoke({ roles: ["attendant", "kitchen", "attendant"] });
    expect(response.status).toBe(200);
    expect(api.roleInsert).toHaveBeenCalledWith([
      { user_id: "new-user", role: "attendant", business_unit_id: UNIT },
      { user_id: "new-user", role: "kitchen", business_unit_id: UNIT },
    ]);
    expect(api.passwordClient.auth.signInWithPassword).toHaveBeenCalled();
  });

  it("rejects missing or unauthorized units before creating the user", async () => {
    for (const unit of [undefined, "00000000-0000-0000-0000-000000000002"]) {
      const api = endpoint();
      expect((await api.invoke({ business_unit_id: unit })).status).toBe(403);
      expect(api.createUser).not.toHaveBeenCalled();
    }
  });

  it("assigns the default attendant role to the unit when roles are empty", async () => {
    const api = endpoint();
    expect((await api.invoke({ roles: [] })).status).toBe(200);
    expect(api.roleInsert).toHaveBeenCalledWith([{ user_id: "new-user", role: "attendant", business_unit_id: UNIT }]);
  });

  it("rolls back the new user if assigning roles fails", async () => {
    const api = endpoint({ message: "role insert failed" });
    expect((await api.invoke()).status).toBe(500);
    expect(api.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("rejects invalid roles before creating the user", async () => {
    const api = endpoint();
    expect((await api.invoke({ roles: ["superadmin"] })).status).toBe(400);
    expect(api.createUser).not.toHaveBeenCalled();
  });
});
