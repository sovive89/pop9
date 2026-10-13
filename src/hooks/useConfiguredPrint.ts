import { usePrinterConfigs, type PrinterGatilho } from "@/hooks/usePrinterConfigs";
import { receiptPrintSettings } from "@/lib/printerPresets";
import { printReceipt } from "@/utils/thermal-print";

/** Browser dialogs retain their native device selection; use saved paper/copies. */
export function useConfiguredPrint() {
  const { getPrintersForGatilho } = usePrinterConfigs();
  return (html: string, gatilho: PrinterGatilho) => {
    const printers = getPrintersForGatilho(gatilho);
    if (!printers.length) { printReceipt(html);return; }
    for (const printer of printers) printReceipt(receiptPrintSettings(html, printer.paperWidth, printer.copies));
  };
}
