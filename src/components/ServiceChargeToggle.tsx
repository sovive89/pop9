import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/orders";

interface Props {
  total: number;
  onPrint: (includeServiceCharge: boolean) => void;
  label: string;
  /** Controlled: quando informado, o toggle fica controlado pelo pai (conta geral com taxa proporcional) */
  includeCharge?: boolean;
  onIncludeChargeChange?: (value: boolean) => void;
}

const ServiceChargeToggle = ({ total, onPrint, label, includeCharge: controlledCharge, onIncludeChargeChange }: Props) => {
  const [internalCharge, setInternalCharge] = useState(false);
  const isControlled = controlledCharge !== undefined && onIncludeChargeChange != null;
  const includeCharge = isControlled ? controlledCharge : internalCharge;
  const handleToggle = () => {
    if (isControlled) onIncludeChargeChange(!includeCharge);
    else setInternalCharge((v) => !v);
  };
  const serviceCharge = total * 0.1;

  return (
    <div className="space-y-2">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors ${
          includeCharge
            ? "border-primary bg-primary/10"
            : "border-border bg-secondary/30"
        }`}
      >
        <span className="text-sm text-foreground">Taxa de serviço (10%)</span>
        <div className="flex items-center gap-2">
          {includeCharge && (
            <span className="text-sm font-semibold text-primary">
              +{formatCurrency(serviceCharge)}
            </span>
          )}
          <div
            className={`h-5 w-9 rounded-full transition-colors relative ${
              includeCharge ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                includeCharge ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
        </div>
      </button>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => onPrint(includeCharge)}
      >
        <Printer className="h-4 w-4" />
        {label}
        {includeCharge && (
          <span className="text-xs text-muted-foreground ml-1">
            ({formatCurrency(total + serviceCharge)})
          </span>
        )}
      </Button>
    </div>
  );
};

export default ServiceChargeToggle;
