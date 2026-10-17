import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { Button } from "@/components/ui/button";
import DebtsReport from "@/components/DebtsReport";
export default function Delinquency() {
  const { user } = useAuth();
  const { canCashier, loading, error } = useUnitRoles();
  const navigate = useNavigate();
  if (loading) return <p role="status" className="p-6">Carregando relatório...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (error) return <p role="alert" className="p-6">Não foi possível verificar suas permissões.</p>;
  if (!canCashier) return <Navigate to="/" replace />;
  return <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6"><Button variant="outline" onClick={()=>navigate("/caixa")}>Voltar ao caixa</Button><DebtsReport /></main>;
}
