export type GetTableInfoRequest = {
  action: "get_table_info";
  table_number?: number;
  token?: string;
};

export type StaffGenerateCodeRequest = {
  action: "staff_generate_code";
  table_number: number;
};

export type RequestCodeRequest = {
  action: "request_code";
  method: "whatsapp_otp";
  table_number: number;
  phone: string;
};

export type VerifyCodeRequest =
  | {
      action: "verify_code";
      method: "staff_code";
      table_number: number;
      code: string;
    }
  | {
      action: "verify_code";
      method: "whatsapp_otp";
      table_number: number;
      code: string;
      phone: string;
      name: string;
    };

export type CheckinRequest =
  | GetTableInfoRequest
  | StaffGenerateCodeRequest
  | RequestCodeRequest
  | VerifyCodeRequest;

type ParseFailure = {
  ok: false;
  error: string;
};

type ParseSuccess<T> = {
  ok: true;
  value: T;
};

export type CheckinRequestParseResult =
  | ParseSuccess<CheckinRequest>
  | ParseFailure;

type JsonRecord = Record<string, unknown>;

type NumberParseResult = ParseSuccess<number> | ParseFailure;
type OptionalNumberParseResult = ParseSuccess<number | undefined> | ParseFailure;
type StringParseResult = ParseSuccess<string> | ParseFailure;
type OptionalStringParseResult = ParseSuccess<string | undefined> | ParseFailure;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredTableNumber(
  body: JsonRecord,
  missingMessage: string,
): NumberParseResult {
  const value = body.table_number;
  if (value === undefined || value === null) {
    return { ok: false, error: missingMessage };
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, error: "Número da mesa inválido" };
  }
  return { ok: true, value };
}

function parseOptionalTableNumber(body: JsonRecord): OptionalNumberParseResult {
  const value = body.table_number;
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, error: "Número da mesa inválido" };
  }
  return { ok: true, value };
}

function parseRequiredString(
  body: JsonRecord,
  field: string,
  missingMessage: string,
  invalidMessage: string,
): StringParseResult {
  const value = body[field];
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return { ok: false, error: missingMessage };
  }
  if (typeof value !== "string") {
    return { ok: false, error: invalidMessage };
  }
  return { ok: true, value };
}

function parseOptionalString(
  body: JsonRecord,
  field: string,
  invalidMessage: string,
): OptionalStringParseResult {
  const value = body[field];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: invalidMessage };
  }
  return { ok: true, value };
}

export function parseCheckinRequest(value: unknown): CheckinRequestParseResult {
  if (!isJsonRecord(value)) {
    return { ok: false, error: "Dados inválidos" };
  }

  const action = value.action;
  if (typeof action !== "string") {
    return { ok: false, error: "Ação desconhecida" };
  }

  switch (action) {
    case "get_table_info": {
      const tableNumber = parseOptionalTableNumber(value);
      if (tableNumber.ok === false) return tableNumber;
      const token = parseOptionalString(value, "token", "Token inválido");
      if (token.ok === false) return token;
      return {
        ok: true,
        value: {
          action,
          table_number: tableNumber.value,
          token: token.value,
        },
      };
    }

    case "staff_generate_code": {
      const tableNumber = parseRequiredTableNumber(value, "Número da mesa é obrigatório");
      if (tableNumber.ok === false) return tableNumber;
      return { ok: true, value: { action, table_number: tableNumber.value } };
    }

    case "request_code": {
      if (value.method !== "whatsapp_otp") {
        return { ok: false, error: "Método inválido" };
      }
      const tableNumber = parseRequiredTableNumber(value, "Número da mesa é obrigatório");
      if (tableNumber.ok === false) return tableNumber;
      const phone = parseRequiredString(
        value,
        "phone",
        "Telefone é obrigatório",
        "Telefone inválido",
      );
      if (phone.ok === false) return phone;
      return {
        ok: true,
        value: { action, method: value.method, table_number: tableNumber.value, phone: phone.value },
      };
    }

    case "verify_code": {
      const method = value.method;
      if (method === undefined || method === null || method === "") {
        return { ok: false, error: "Dados incompletos" };
      }
      if (method !== "staff_code" && method !== "whatsapp_otp") {
        return { ok: false, error: "Método inválido" };
      }

      const tableNumber = parseRequiredTableNumber(value, "Dados incompletos");
      if (tableNumber.ok === false) return tableNumber;
      const code = parseRequiredString(value, "code", "Dados incompletos", "Código inválido");
      if (code.ok === false) return code;

      if (method === "staff_code") {
        return {
          ok: true,
          value: { action, method, table_number: tableNumber.value, code: code.value },
        };
      }

      const name = parseRequiredString(value, "name", "Nome é obrigatório", "Nome inválido");
      if (name.ok === false) return name;
      const phone = parseRequiredString(value, "phone", "Telefone é obrigatório", "Telefone inválido");
      if (phone.ok === false) return phone;
      return {
        ok: true,
        value: {
          action,
          method,
          table_number: tableNumber.value,
          code: code.value,
          phone: phone.value,
          name: name.value,
        },
      };
    }

    default:
      return { ok: false, error: "Ação desconhecida" };
  }
}
