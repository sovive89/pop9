import { X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printReceipt } from "@/utils/thermal-print";

interface Props {
  receiptHtml: string | null;
  onClose: () => void;
  title?: string;
}

/**
 * Modal que exibe na tela o mesmo conteúdo enviado para impressão térmica (conta da mesa ou individual).
 * Permite fechar e reimprimir.
 */
const ReceiptPreviewModal = ({ receiptHtml, onClose, title = "Conta para impressão" }: Props) => {
  if (!receiptHtml) return null;

  const handlePrintAgain = () => {
    printReceipt(receiptHtml!);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl flex flex-col max-h-[90vh] w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintAgain}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 bg-white">
          <iframe
            title={title}
            srcDoc={receiptHtml}
            className="w-full min-h-[420px] border-0 bg-white rounded"
            sandbox="allow-same-origin"
            style={{ height: "min(70vh, 600px)" }}
          />
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreviewModal;
