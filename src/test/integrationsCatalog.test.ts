import { describe, expect, it } from "vitest";
import { INTEGRATIONS_CATALOG, getIntegrationDefinition } from "@/components/admin/connections/catalog";
import {
  CAPABILITY_ORDER,
  CATEGORY_LABELS,
  TYPE_LABELS,
} from "@/components/admin/connections/types";

// Testes de caracterização do catálogo de Conexões (etapa 0 da separação
// ERP/Hub). Servem de rede de segurança para quando o catálogo for dividido
// por capacidade/finalidade (etapa 4): o conjunto de integrações não pode
// mudar sem que isso seja decidido de propósito.

const idsOfType = (type: string) =>
  INTEGRATIONS_CATALOG.filter((i) => i.type === type)
    .map((i) => i.id)
    .sort();

describe("catálogo de integrações", () => {
  it("ids e slugs são únicos e iguais entre si (slug é gravado em integrations.provider)", () => {
    const ids = INTEGRATIONS_CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of INTEGRATIONS_CATALOG) expect(i.slug).toBe(i.id);
  });

  it("categorias, tipos e capacidades são válidos", () => {
    for (const i of INTEGRATIONS_CATALOG) {
      expect(Object.keys(CATEGORY_LABELS)).toContain(i.category);
      expect(Object.keys(TYPE_LABELS)).toContain(i.type);
      if (i.capabilities) {
        for (const cap of CAPABILITY_ORDER) {
          expect(["YES", "NO", "API_DEPENDENT"]).toContain(i.capabilities[cap]);
        }
      }
    }
  });

  it("só o WhatsApp está marcado como implementado hoje", () => {
    const implemented = INTEGRATIONS_CATALOG.filter((i) => i.implemented).map((i) => i.id);
    expect(implemented).toEqual(["whatsapp"]);
  });

  it("POS do tipo IMPORT (candidatos a conectores do Hub)", () => {
    expect(idsOfType("IMPORT")).toEqual(["colibri", "consumer", "everest", "linx", "saipos", "sischef"]);
  });

  it("integrações operacionais conhecidas (delivery, pagamentos, comunicação, gestão, e-commerce)", () => {
    const operational = idsOfType("OPERATIONAL");
    for (const id of ["ifood", "99food", "whatsapp", "mercadopago", "pix", "omie"]) {
      expect(operational).toContain(id);
    }
  });

  it("getIntegrationDefinition encontra por slug e devolve undefined se não existe", () => {
    expect(getIntegrationDefinition("ifood")?.name).toBe("iFood");
    expect(getIntegrationDefinition("nao-existe")).toBeUndefined();
  });
});
