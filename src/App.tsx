import { lazy, Suspense, useEffect, useState } from "react";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { supabase } from "@/integrations/supabase/client";
import BusinessUnitSelector from "@/components/BusinessUnitSelector";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import AdminAssistant from "@/components/AdminAssistant";
import PublicOrder from "./pages/PublicOrder";
const OnlineOrders = lazy(() => import("./pages/OnlineOrders"));
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalTooltips } from "@/components/GlobalTooltips";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RecuperarSenha from "./pages/RecuperarSenha";
const Kitchen = lazy(() => import("./pages/Kitchen"));
const PrintStation = lazy(() => import("./pages/PrintStation"));
const Admin = lazy(() => import("./pages/Admin"));
const Cashier = lazy(() => import("./pages/Cashier"));
const Delinquency = lazy(() => import("./pages/Delinquency"));
const Reports = lazy(() => import("./pages/Reports"));
import CustomerCheckin from "./pages/CustomerCheckin";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const UnitSelector = () => {
  const { units, requiresSelection, selectBusinessUnit, loading } = useCurrentBusinessUnit();
  if (loading || !requiresSelection) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Selecionar unidade">
    <div className="w-full max-w-md rounded-xl bg-background border border-border p-6 space-y-4">
      <h2 className="text-lg font-semibold">Selecionar unidade</h2>
      <p className="text-sm text-muted-foreground">Escolha a unidade em que deseja operar.</p>
      {units.map(unit => <button data-tooltip="Selecione a unidade em que deseja operar." key={unit.id} type="button" className="w-full rounded-lg border border-border p-3 text-left hover:bg-accent" onClick={() => selectBusinessUnit(unit.id)}>{unit.name}</button>)}
    </div>
  </div>;
};

const UnitHeader = () => {
  const { user } = useAuth();
  const { roles, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const [profile, setProfile] = useState({ userId: "", name: "" });
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    void supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!disposed) setProfile({ userId, name: data?.full_name ?? "" });
    });
    return () => { disposed = true; };
  }, [userId]);
  const roleLabel = rolesLoading ? "Consultando perfil..." : rolesError ? "Perfil indisponível" : roles.includes("admin") ? "Administrador" : roles.includes("cashier") ? "Caixa" : roles.includes("attendant") ? "Atendente" : roles.includes("kitchen") ? "Cozinha" : "Sem perfil na unidade";
  const { pathname } = useLocation();
  const internal = ["/", "/atendimento", "/cozinha", "/impressao", "/admin", "/caixa", "/inadimplencia", "/relatorios", "/pedidos-online"].includes(pathname);
  if (!user || !internal) return null;
  return <><div className="sticky top-0 z-30 border-b bg-card px-4 py-2"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2"><BusinessUnitSelector /><p className="text-xs text-muted-foreground">{profile.userId === userId && profile.name ? `${profile.name} — ` : ""}{roleLabel}</p></div></div><UnitSelector /></>;
};

const UnitRoutes = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
  return <Routes key={businessUnitId ?? "no-unit"}>
          <Route path="/" element={<Index />} />
          <Route path="/atendimento" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/cozinha" element={<Kitchen />} />
          <Route path="/impressao" element={<PrintStation />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/caixa" element={<Cashier />} />
          <Route path="/inadimplencia" element={<Delinquency />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/pedir/:unit" element={<PublicOrder />} />
          <Route path="/pedidos-online" element={<OnlineOrders />} />
          <Route path="/m" element={<CustomerCheckin />} />
          <Route path="/m/t/:token" element={<CustomerCheckin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GlobalTooltips />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <UnitHeader />
        <Suspense fallback={<p role="status" className="p-6">Carregando tela...</p>}><UnitRoutes /></Suspense>
        <AdminAssistant />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
