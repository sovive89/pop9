import { describe, it, expect } from "vitest";
import { shouldFallbackSessionsSelect } from "@/hooks/useSessionStore";

describe("shouldFallbackSessionsSelect", () => {
  it("returns true for missing orders_1.origin column", () => {
    expect(
      shouldFallbackSessionsSelect({
        code: "42703",
        message: 'column orders_1.origin does not exist',
      })
    ).toBe(true);
  });

  it("returns false for other postgres errors", () => {
    expect(
      shouldFallbackSessionsSelect({
        code: "42703",
        message: 'column orders_1.foo does not exist',
      })
    ).toBe(false);
  });

  it("returns false for undefined error", () => {
    expect(shouldFallbackSessionsSelect(undefined)).toBe(false);
  });
});
