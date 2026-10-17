import { describe, expect, it } from "vitest";
import { parseCheckinRequest } from "../../supabase/functions/_shared/checkin-request.ts";

describe("parseCheckinRequest", () => {
  it("aceita get_table_info com mesa opcional ou token", () => {
    expect(parseCheckinRequest({ action: "get_table_info" })).toEqual({
      ok: true,
      value: { action: "get_table_info", table_number: undefined, token: undefined },
    });
    expect(
      parseCheckinRequest({ action: "get_table_info", table_number: 12, token: "qr-token" }),
    ).toEqual({
      ok: true,
      value: { action: "get_table_info", table_number: 12, token: "qr-token" },
    });
  });

  it("produz DTOs tipados para código do staff e solicitação de OTP", () => {
    expect(
      parseCheckinRequest({ action: "staff_generate_code", table_number: 4 }),
    ).toEqual({
      ok: true,
      value: { action: "staff_generate_code", table_number: 4 },
    });
    expect(
      parseCheckinRequest({
        action: "request_code",
        method: "whatsapp_otp",
        table_number: 4,
        phone: "+5511999999999",
      }),
    ).toEqual({
      ok: true,
      value: {
        action: "request_code",
        method: "whatsapp_otp",
        table_number: 4,
        phone: "+5511999999999",
      },
    });
  });

  it("aceita os dois métodos de verificação com seus campos apropriados", () => {
    expect(
      parseCheckinRequest({
        action: "verify_code",
        method: "staff_code",
        table_number: 4,
        code: "1234",
      }),
    ).toEqual({
      ok: true,
      value: { action: "verify_code", method: "staff_code", table_number: 4, code: "1234" },
    });
    expect(
      parseCheckinRequest({
        action: "verify_code",
        method: "whatsapp_otp",
        table_number: 4,
        code: "123456",
        phone: "+5511999999999",
        name: "Cliente",
      }),
    ).toEqual({
      ok: true,
      value: {
        action: "verify_code",
        method: "whatsapp_otp",
        table_number: 4,
        code: "123456",
        phone: "+5511999999999",
        name: "Cliente",
      },
    });
  });

  it.each([
    [{ action: "staff_generate_code", table_number: "4" }, "Número da mesa inválido"],
    [{ action: "get_table_info", table_number: 0 }, "Número da mesa inválido"],
    [{ action: "get_table_info", token: 123 }, "Token inválido"],
    [
      { action: "request_code", method: "whatsapp_otp", table_number: 4, phone: 123 },
      "Telefone inválido",
    ],
    [
      { action: "verify_code", method: "whatsapp_otp", table_number: 4, code: "123456" },
      "Nome é obrigatório",
    ],
  ])("rejeita tipos malformados antes do handler: %j", (body, error) => {
    expect(parseCheckinRequest(body)).toEqual({ ok: false, error });
  });

  it("respeita o limite integer em todos os métodos", () => {
    const requests = [
      { action: "get_table_info" },
      { action: "staff_generate_code" },
      { action: "request_code", method: "whatsapp_otp", phone: "11999999999" },
      { action: "verify_code", method: "staff_code", code: "1234" },
    ];
    for (const request of requests) {
      expect(parseCheckinRequest({ ...request, table_number: 2147483647 }).ok).toBe(true);
      for (const table_number of [2147483648, Number.MAX_SAFE_INTEGER, NaN, Infinity, -1, 0, 1.5]) {
        expect(parseCheckinRequest({ ...request, table_number })).toEqual({ ok: false, error: "Número da mesa inválido" });
      }
    }
  });

  it("rejeita JSON que não é objeto e campos obrigatórios ausentes", () => {
    expect(parseCheckinRequest(null)).toEqual({ ok: false, error: "Dados inválidos" });
    expect(parseCheckinRequest({ action: "verify_code", method: "staff_code" })).toEqual({
      ok: false,
      error: "Dados incompletos",
    });
    expect(parseCheckinRequest({ action: "request_code", method: "email", table_number: 4 })).toEqual({
      ok: false,
      error: "Método inválido",
    });
    expect(parseCheckinRequest({ action: "unknown" })).toEqual({
      ok: false,
      error: "Ação desconhecida",
    });
  });
});
