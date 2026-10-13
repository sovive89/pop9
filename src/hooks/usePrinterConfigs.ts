import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";

export type PrinterTipo = "termica" | "etiqueta";
export type PrinterGatilho =
  | "comanda_cozinha"
  | "comanda_garcom"
  | "conta_mesa"
  | "conta_individual"
  | "pedido_pronto"
  | "etiqueta_producao";
export type PrinterConnectionType = "browser" | "qz_tray" | "webusb";

export interface PrinterConfig {
  id: string;
  businessUnitId: string | null;
  name: string;
  tipo: PrinterTipo;
  /** Gatilho principal (o primeiro da lista). Mantido para o código antigo. */
  gatilho: PrinterGatilho;
  /** Todos os momentos em que esta impressora imprime. */
  gatilhos: PrinterGatilho[];
  connectionType: PrinterConnectionType;
  deviceIdentifier: string | null;
  active: boolean;
  /** IP/nome da térmica de rede usada pelo print server (porta 9100). */
  host: string | null;
  port: number;
  paperWidth: number;
  copies: number;
  autoCut: boolean;
  /** Setores da comanda que esta impressora recebe no print server. */
  destinos: PrinterDestino[];
}

export type PrinterDestino = "kitchen" | "bar";
export const DESTINO_LABELS: Record<PrinterDestino, string> = { kitchen: "Cozinha", bar: "Bar" };

/** IP ou nome de rede simples (sem protocolo, porta ou caminho). */
export const isValidHost = (v: string) => /^[A-Za-z0-9.-]{1,253}$/.test(v);

export type PrinterNetworkInput = { host: string | null; port: number; paperWidth: number; copies: number; autoCut: boolean; destinos: PrinterDestino[] };
const networkColumns = (n: Partial<PrinterNetworkInput>) => ({
  ...(n.host !== undefined && { host: n.host }),
  ...(n.port !== undefined && { port: n.port }),
  ...(n.paperWidth !== undefined && { paper_width: n.paperWidth }),
  ...(n.copies !== undefined && { copies: n.copies }),
  ...(n.autoCut !== undefined && { auto_cut: n.autoCut }),
  ...(n.destinos !== undefined && { destinos: n.destinos }),
});

/** Sem repetidos e só valores conhecidos, na ordem em que aparecem em GATILHO_LABELS. */
export function normalizeGatilhos(values: readonly string[]): PrinterGatilho[] {
  const set = new Set(values);
  return (Object.keys(GATILHO_LABELS) as PrinterGatilho[]).filter((g) => set.has(g));
}

export const GATILHO_LABELS: Record<PrinterGatilho, string> = {
  comanda_cozinha: "Comanda da cozinha/bar",
  comanda_garcom: "Comanda do garçom",
  conta_mesa: "Conta da mesa",
  conta_individual: "Conta individual",
  pedido_pronto: "Aviso de pedido pronto",
  etiqueta_producao: "Etiqueta de lote produzido",
};

export const CONNECTION_TYPE_LABELS: Record<PrinterConnectionType, string> = {
  browser: "Diálogo do navegador",
  qz_tray: "QZ Tray",
  webusb: "WebUSB",
};

export const usePrinterConfigs = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPrinters = useCallback(async () => {
    const { data, error } = await supabase
      .from("printer_configs")
      .select("*")
      .order("name");
    if (error) {
      toast.error("Erro ao carregar impressoras");
      return;
    }
    setPrinters(
      (data ?? []).map((p) => ({
        id: p.id,
        businessUnitId: p.business_unit_id,
        name: p.name,
        tipo: p.tipo as PrinterTipo,
        gatilho: p.gatilho as PrinterGatilho,
        // Antes da migration de vários gatilhos, a lista não existe: usa o gatilho único.
        gatilhos: normalizeGatilhos(p.gatilhos?.length ? p.gatilhos : [p.gatilho]),
        connectionType: p.connection_type as PrinterConnectionType,
        deviceIdentifier: p.device_identifier,
        active: p.active,
        host: p.host ?? null,
        port: p.port ?? 9100,
        paperWidth: p.paper_width ?? 80,
        copies: p.copies ?? 1,
        autoCut: p.auto_cut ?? true,
        destinos: ((p.destinos?.length ? p.destinos : ["kitchen", "bar"]) as PrinterDestino[]),
      }))
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    loadPrinters().finally(() => setLoading(false));
  }, [loadPrinters]);

  const createPrinter = async (input: {
    name: string;
    tipo: PrinterTipo;
    gatilhos: PrinterGatilho[];
    connectionType: PrinterConnectionType;
    deviceIdentifier?: string | null;
  } & Partial<PrinterNetworkInput>) => {
    const gatilhos = normalizeGatilhos(input.gatilhos);
    if (!gatilhos.length) {
      toast.error("Escolha pelo menos um gatilho");
      return false;
    }
    const { error } = await supabase.from("printer_configs").insert({
      name: input.name,
      tipo: input.tipo,
      gatilho: gatilhos[0],
      gatilhos,
      connection_type: input.connectionType,
      device_identifier: input.deviceIdentifier || null,
      business_unit_id: businessUnitId,
      ...networkColumns(input),
    });
    if (error) {
      toast.error("Erro ao criar impressora: " + error.message);
      return false;
    }
    toast.success("Impressora cadastrada");
    await loadPrinters();
    return true;
  };

  const updatePrinter = async (
    id: string,
    input: Partial<{
      name: string;
      tipo: PrinterTipo;
      gatilhos: PrinterGatilho[];
      connectionType: PrinterConnectionType;
      deviceIdentifier: string | null;
      active: boolean;
    } & PrinterNetworkInput>
  ) => {
    const gatilhos = input.gatilhos !== undefined ? normalizeGatilhos(input.gatilhos) : undefined;
    if (gatilhos && !gatilhos.length) {
      toast.error("Escolha pelo menos um gatilho");
      return false;
    }
    const { error } = await supabase
      .from("printer_configs")
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.tipo !== undefined && { tipo: input.tipo }),
        ...(gatilhos && { gatilho: gatilhos[0], gatilhos }),
        ...(input.connectionType !== undefined && { connection_type: input.connectionType }),
        ...(input.deviceIdentifier !== undefined && { device_identifier: input.deviceIdentifier }),
        ...(input.active !== undefined && { active: input.active }),
        ...networkColumns(input),
      })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar impressora: " + error.message);
      return false;
    }
    await loadPrinters();
    return true;
  };

  const deletePrinter = async (id: string) => {
    const { error } = await supabase.from("printer_configs").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover impressora: " + error.message);
      return false;
    }
    toast.success("Impressora removida");
    await loadPrinters();
    return true;
  };

  /** Impressoras ativas que imprimem neste gatilho (pode haver mais de uma). */
  const getPrintersForGatilho = useCallback(
    (gatilho: PrinterGatilho) => printers.filter((p) => p.active && p.gatilhos.includes(gatilho)),
    [printers]
  );
  /** Impressora ativa configurada pra um gatilho específico (a 1ª, se houver mais de uma). */
  const getPrinterForGatilho = useCallback(
    (gatilho: PrinterGatilho) => getPrintersForGatilho(gatilho)[0] ?? null,
    [getPrintersForGatilho]
  );

  return {
    printers,
    loading,
    createPrinter,
    updatePrinter,
    deletePrinter,
    getPrinterForGatilho,
    getPrintersForGatilho,
    refresh: loadPrinters,
  };
};
