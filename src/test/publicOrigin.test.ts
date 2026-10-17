import {describe,it,expect} from "vitest";
import {publicOriginOrEmpty} from "@/utils/operationalLinks";

describe("pré-preenchimento do endereço público do PWA",()=>{
  it("aceita só a origem HTTPS pública que o servidor também aceita",()=>{
    expect(publicOriginOrEmpty("https://pop9-lv5p.vercel.app")).toBe("https://pop9-lv5p.vercel.app");
    for(const value of ["http://pop9-lv5p.vercel.app","https://localhost","https://erp.example:8443","https://loja.local","https://192.168.0.10","https://[::1]","https://x.com/pedir","não é url"])
      expect(publicOriginOrEmpty(value)).toBe("");
  });
});
