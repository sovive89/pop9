import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Flame } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"]["app_role"];

/** Tela inicial de cada papel (admin tem prioridade sobre os demais). */
export const roleHome = (roles: Role[]): string | null =>
  roles.includes("admin") || roles.includes("attendant") ? "/"
  : roles.includes("cashier") ? "/caixa"
  : roles.includes("kitchen") ? "/cozinha"
  : null;

/**
 * Guard central de rota. Só organiza a interface: a autorização real
 * continua no servidor (RLS / edge functions). As páginas mantêm os
 * próprios guards como segunda camada.
 */
export default function RoleRoute({ roles: allowed, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { roles, loading, error } = useUnitRoles();

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Flame className="h-10 w-10 animate-pulse text-primary" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <p role="alert" className="p-6">Não foi possível verificar suas permissões. Recarregue a página.</p>;
  if (roles.some(role => allowed.includes(role))) return <>{children}</>;
  const home = roleHome(roles);
  // Sem papel na unidade: não redireciona (evita laço com /login).
  if (!home) return <p role="alert" className="p-6">Seu usuário não tem perfil nesta unidade. Peça a um administrador para liberar o acesso.</p>;
  return <Navigate to={home} replace />;
}
