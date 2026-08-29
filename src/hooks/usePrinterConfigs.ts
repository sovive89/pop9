import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  gatilho: PrinterGatilho;
  connectionType: PrinterConnectionType;
  deviceIdentifier: string | null;
  active: boolean;
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
        connectionType: p.connection_type as PrinterConnectionType,
        deviceIdentifier: p.device_identifier,
        active: p.active,
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
    gatilho: PrinterGatilho;
    connectionType: PrinterConnectionType;
    deviceIdentifier?: string | null;
  }) => {
    const { error } = await supabase.from("printer_configs").insert({
      name: input.name,
      tipo: input.tipo,
      gatilho: input.gatilho,
      connection_type: input.connectionType,
      device_identifier: input.deviceIdentifier || null,
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
      gatilho: PrinterGatilho;
      connectionType: PrinterConnectionType;
      deviceIdentifier: string | null;
      active: boolean;
    }>
  ) => {
    const { error } = await supabase
      .from("printer_configs")
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.tipo !== undefined && { tipo: input.tipo }),
        ...(input.gatilho !== undefined && { gatilho: input.gatilho }),
        ...(input.connectionType !== undefined && { connection_type: input.connectionType }),
        ...(input.deviceIdentifier !== undefined && { device_identifier: input.deviceIdentifier }),
        ...(input.active !== undefined && { active: input.active }),
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

  /** Impressora ativa configurada pra um gatilho específico (a 1ª, se houver mais de uma). */
  const getPrinterForGatilho = useCallback(
    (gatilho: PrinterGatilho) => printers.find((p) => p.gatilho === gatilho && p.active) ?? null,
    [printers]
  );

  return {
    printers,
    loading,
    createPrinter,
    updatePrinter,
    deletePrinter,
    getPrinterForGatilho,
    refresh: loadPrinters,
  };
};
