import { usePrinterConfigs, type PrinterGatilho } from "@/hooks/usePrinterConfigs";
import { receiptPrintSettings } from "@/lib/printerPresets";
import { printReceipt } from "@/utils/thermal-print";

/** Browser dialogs retain their native device selection; use saved paper/copies. */
export function useConfiguredPrint() {
  const { getPrintersForGatilho } = usePrinterConfigs();
  return (html: string, gatilho: PrinterGatilho) => {
    const printers = getPrintersForGatilho(gatilho);
    if (!printers.length) { printReceipt(html);return html; }
    let preview = html;
    for (const [index, printer] of printers.entries()) {
      const prepared = receiptPrintSettings(html, printer.paperWidth, printer.copies);
      if (index === 0) preview = prepared;
      printReceipt(prepared);
    }
    return preview;
  };
}
