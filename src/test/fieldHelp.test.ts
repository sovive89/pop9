import { describe, expect, it } from "vitest";
import { fieldHelp, fieldLabel } from "@/lib/field-help";
import { getTooltipText } from "@/lib/tooltip-text";

const mount = (html: string) => { document.body.innerHTML = html; return document.body.querySelector("input, select, textarea")!; };

describe("field help tooltips", () => {
  it("finds an unlinked sibling label and explains known fields", () => {
    const input = mount(`<div><label>Chave (slug)</label><input placeholder="ex: saladas"></div>`);
    expect(fieldLabel(input)).toBe("Chave (slug)");
    expect(getTooltipText(input)).toMatch(/Código interno, sem acento/);
  });

  it("explains Ordem and IP fields", () => {
    expect(getTooltipText(mount(`<div><label>Ordem</label><input type="number"></div>`))).toMatch(/menor número aparece primeiro/);
    expect(getTooltipText(mount(`<div class="space-y-1"><label>IP da impressora</label><input placeholder="192.168.0.50"></div>`))).toMatch(/rede da loja/);
  });

  it("falls back to an instruction with the example for unknown fields", () => {
    expect(fieldHelp(mount(`<div><label>Apelido do turno</label><input placeholder="Noite"></div>`))).toBe("Preencha Apelido do turno. Ex.: Noite.");
  });

  it("keeps explicit data-tooltip and never exposes typed values", () => {
    expect(getTooltipText(mount(`<div><label>Ordem</label><input data-tooltip="Ajuda própria"></div>`))).toBe("Ajuda própria");
    const pw = mount(`<label>Senha<input type="password" value="segredo123"></label>`);
    expect(getTooltipText(pw)).not.toContain("segredo123");
  });
});
