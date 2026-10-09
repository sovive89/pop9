import AdminAssistant from "@/components/AdminAssistant";
import PublicOrder from "./pages/PublicOrder";
import OnlineOrders from "./pages/OnlineOrders";
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
import Kitchen from "./pages/Kitchen";
import Admin from "./pages/Admin";
import Cashier from "./pages/Cashier";
import Delinquency from "./pages/Delinquency";
import Reports from "./pages/Reports";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <GlobalTooltips />
      <Toaster />
      <Sonner />
      <UnitSelector />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/atendimento" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/cozinha" element={<Kitchen />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/caixa" element={<Cashier />} />
          <Route path="/inadimplencia" element={<Delinquency />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/pedir/:unit" element={<PublicOrder />} />
          <Route path="/pedidos-online" element={<OnlineOrders />} />
          <Route path="/m" element={<CustomerCheckin />} />
          <Route path="/m/t/:token" element={<CustomerCheckin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <AdminAssistant />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
