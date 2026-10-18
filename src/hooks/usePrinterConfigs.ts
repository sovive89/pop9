import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { useAuth } from "@/hooks/useAuth";

export type PrinterTipo = "termica" | "etiqueta";
export type PrinterGatilho =
  | "comanda_cozinha"
  | "comanda_garcom"
  | "conta_mesa"
  | "conta_individual"
  | "pedido_pronto"
  | "etiqueta_producao";
export type PrinterConnectionType = "browser" | "qz_tray" | "webusb" | "tcp";
export type PrinterSector = string;
export const SECTOR_LABELS: Record<PrinterSector, string> = { cozinha: "Cozinha", bar: "Bar", caixa: "Caixa", expedicao: "Expedição", producao: "Produção", geral: "Geral" };

export interface PrinterConfig {
  id: string;
  businessUnitId: string | null;
  name: string;
  setor: PrinterSector;
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

export type PrinterDestino = string;
export const DESTINO_LABELS: Record<string, string> = { kitchen: "Cozinha", bar: "Bar" };

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
  tcp: "Rede/TCP (print server)",
  browser: "Diálogo do navegador",
  qz_tray: "QZ Tray",
  webusb: "WebUSB",
};
/** Preserve the legacy connection_type constraint and use transport for the agent. */
export function printerConnectionColumns(connectionType: PrinterConnectionType) {
  return {
    connection_type: connectionType === "tcp" ? "browser" : connectionType,
    transport: connectionType === "tcp" ? "tcp" : "browser",
  };
}
const EMPTY_PRINTERS: PrinterConfig[] = [];

export const usePrinterConfigs = () => {
  const { user } = useAuth();
  const { businessUnitId } = useCurrentBusinessUnit();
  const scope = `${user?.id}:${businessUnitId}`;
  const current = useRef(scope);current.current = scope;
  const generation = useRef(0);
  const [state, setState] = useState<{ scope: string; printers: PrinterConfig[]; error: boolean }>({ scope: "", printers: [], error: false });
  const visible = Boolean(user && businessUnitId) && state.scope === scope;
  const printers = visible ? state.printers : EMPTY_PRINTERS;
  const loading = Boolean(user && businessUnitId) && !visible;
  const error = visible && state.error;

  const loadPrinters = useCallback(async () => {
    if (!user?.id || !businessUnitId) return;
    const request = ++generation.current;
    try {
    const { data, error } = await supabase
      .from("printer_configs")
      .select("*")
      .eq("business_unit_id", businessUnitId)
      .order("name");
    if (current.current !== scope || request !== generation.current) return;
    if (error) {
      setState({ scope, printers: [], error: true });
      return;
    }
    const mapped: PrinterConfig[] =
      (data ?? []).map((p) => ({
        id: p.id,
        businessUnitId: p.business_unit_id,
        name: p.name,
        setor: (p.setor ?? "geral") as PrinterSector,
        tipo: p.tipo as PrinterTipo,
        gatilho: p.gatilho as PrinterGatilho,
        // Antes da migration de vários gatilhos, a lista não existe: usa o gatilho único.
        gatilhos: normalizeGatilhos(p.gatilhos?.length ? p.gatilhos : [p.gatilho]),
        // TCP uses the existing transport column; connection_type keeps its legacy values.
        connectionType: p.transport === "tcp" && p.host ? "tcp" : p.connection_type as PrinterConnectionType,
        deviceIdentifier: p.device_identifier,
        active: p.active,
        host: p.host ?? null,
        port: p.port ?? 9100,
        paperWidth: p.paper_width ?? 80,
        copies: p.copies ?? 1,
        autoCut: p.auto_cut ?? true,
        destinos: ((p.destinos?.length ? p.destinos : ["kitchen", "bar"]) as PrinterDestino[]),
      }));
    setState({ scope, printers: mapped, error: false });
    } catch { if (current.current === scope && request === generation.current) setState({ scope, printers: [], error: true }); }
  }, [businessUnitId, scope, user?.id]);

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  const createPrinter = async (input: {
    name: string;
    setor?: PrinterSector;
    tipo: PrinterTipo;
    gatilhos: PrinterGatilho[];
    connectionType: PrinterConnectionType;
    deviceIdentifier?: string | null;
  } & Partial<PrinterNetworkInput>) => {
    if (!user || !businessUnitId) return false;
    const requestScope = scope;
    const gatilhos = normalizeGatilhos(input.gatilhos);
    if (!gatilhos.length) {
      toast.error("Escolha pelo menos um gatilho");
      return false;
    }
    const { error } = await supabase.from("printer_configs").insert({
      name: input.name,
      setor: input.setor ?? "geral",
      tipo: input.tipo,
      gatilho: gatilhos[0],
      gatilhos,
      ...printerConnectionColumns(input.connectionType),
      device_identifier: input.deviceIdentifier || null,
      business_unit_id: businessUnitId,
      ...networkColumns(input),
    });
    if (current.current !== requestScope) return false;
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
      setor: PrinterSector;
      tipo: PrinterTipo;
      gatilhos: PrinterGatilho[];
      connectionType: PrinterConnectionType;
      deviceIdentifier: string | null;
      active: boolean;
    } & PrinterNetworkInput>
  ) => {
    if (!user || !businessUnitId || !printers.some(printer => printer.id === id)) return false;
    const requestScope = scope;
    const gatilhos = input.gatilhos !== undefined ? normalizeGatilhos(input.gatilhos) : undefined;
    if (gatilhos && !gatilhos.length) {
      toast.error("Escolha pelo menos um gatilho");
      return false;
    }
    const { error } = await supabase
      .from("printer_configs")
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.setor !== undefined && { setor: input.setor }),
        ...(input.tipo !== undefined && { tipo: input.tipo }),
        ...(gatilhos && { gatilho: gatilhos[0], gatilhos }),
        ...(input.connectionType !== undefined && printerConnectionColumns(input.connectionType)),
        ...(input.deviceIdentifier !== undefined && { device_identifier: input.deviceIdentifier }),
        ...(input.active !== undefined && { active: input.active }),
        ...networkColumns(input),
      })
      .eq("id", id).eq("business_unit_id", businessUnitId);
    if (current.current !== requestScope) return false;
    if (error) {
      toast.error("Erro ao atualizar impressora: " + error.message);
      return false;
    }
    await loadPrinters();
    return true;
  };

  const deletePrinter = async (id: string) => {
    if (!user || !businessUnitId || !printers.some(printer => printer.id === id)) return false;
    const requestScope = scope;
    const { error } = await supabase.from("printer_configs").delete().eq("id", id).eq("business_unit_id", businessUnitId);
    if (current.current !== requestScope) return false;
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
    error,
    scope,
    reload: loadPrinters,
    createPrinter,
    updatePrinter,
    deletePrinter,
    getPrinterForGatilho,
    getPrintersForGatilho,
    refresh: loadPrinters,
  };
};
