import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import RecuperarSenha from "./pages/RecuperarSenha";
import Kitchen from "./pages/Kitchen";
import Admin from "./pages/Admin";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/recuperar-senha" element={<RecuperarSenha />} />
          <Route path="/cozinha" element={<Kitchen />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
