import { MoreVertical, Settings, Unplug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IntegrationLogo } from "./IntegrationLogo";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { IntegrationTypeBadge, primaryActionLabel } from "./IntegrationMeta";
import { CATEGORY_LABELS } from "./types";
import type { IntegrationView } from "./types";

export function IntegrationCard({
  view,
  onOpen,
  onDisconnect,
}: {
  view: IntegrationView;
  onOpen: () => void;
  onDisconnect: () => void;
}) {
  const { definition, status } = view;
  const isConnected = status === "CONNECTED";

  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <IntegrationLogo definition={definition} size={40} className="shrink-0 overflow-hidden rounded-lg" />
          <IntegrationTypeBadge type={definition.type} className="mt-1" />
        </div>
        {isConnected && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1 text-muted-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>
                <Settings className="mr-2 h-4 w-4" /> Configurar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDisconnect} className="text-destructive focus:text-destructive">
                <Unplug className="mr-2 h-4 w-4" /> Desconectar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="font-medium text-foreground leading-none">{definition.name}</h3>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {CATEGORY_LABELS[definition.category]}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-2">{definition.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <IntegrationStatusBadge status={status} />
        {!isConnected && (
          <Button size="sm" variant="outline" onClick={onOpen}>
            {primaryActionLabel(definition.type)}
          </Button>
        )}
      </div>
    </Card>
  );
}
