import { describe, expect, it, vi } from "vitest";

// Cliente falso que, como o supabase-js real, depende de "this" dentro de rpc().
vi.mock("@/integrations/supabase/client", () => {
  const client = {
    rest: { ok: true },
    rpc(this: { rest?: unknown } | undefined, fn: string) {
      if (!this?.rest) throw new TypeError("undefined is not an object (evaluating 'this.rest')");
      return Promise.resolve({ data: fn === "apply_menu_import" ? { created: 0 } : true, error: null });
    },
  };
  return { supabase: client };
});

import { setUnitKds } from "@/hooks/useUnitKds";
import { setUnitPrintMode } from "@/hooks/useUnitPrintMode";

describe("RPC calls keep the Supabase client bound", () => {
  it("toggles the KDS and print modules without losing this", async () => {
    await expect(setUnitKds("00000000-0000-0000-0000-000000000001", false)).resolves.not.toThrow();
    await expect(setUnitPrintMode("00000000-0000-0000-0000-000000000001", "station")).resolves.not.toThrow();
  });
});
