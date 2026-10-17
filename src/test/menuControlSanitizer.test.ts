// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  replaceAsciiControlChars,
  sanitizeDraft,
} from "../../supabase/functions/_shared/menu-import-schema";

describe("menu import control-character sanitizer", () => {
  it("replaces exactly U+0000 through U+001F and U+007F with spaces", () => {
    const asciiControls = Array.from({ length: 0x20 }, (_, codePoint) =>
      String.fromCodePoint(codePoint),
    ).join("");

    expect(replaceAsciiControlChars(`a${asciiControls}\u007fb`)).toBe(
      `a${" ".repeat(0x21)}b`,
    );
  });

  it("does not broaden the replacement to Unicode C1 controls", () => {
    const c1Controls = "\u0080\u0081\u009f";

    expect(replaceAsciiControlChars(`a${c1Controls}b`)).toBe(
      `a${c1Controls}b`,
    );
  });

  it("uses the exact sanitizer before normalizing menu text", () => {
    const { draft } = sanitizeDraft({
      items: [
        {
          name: "A\u001fB\u0080C\u007fD",
          category: "testes",
          price: 1,
        },
      ],
    });

    expect(draft.items[0].name).toBe("A B\u0080C D");
  });
});
