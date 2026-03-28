import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Users, UtensilsCrossed, KeyRound, LayoutGrid, BarChart3, Package, Map, ChefHat, Settings, Link2, Webhook, ExternalLink, MessageCircle, Contact, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MenuTab from "@/components/admin/MenuTab";
import UsersTab from "@/components/admin/UsersTab";
import ResetPasswordTab from "@/components/admin/ResetPasswordTab";
import TablesTab from "@/components/admin/TablesTab";
import WhatsAppTab from "@/components/admin/WhatsAppTab";
import CRMTab from "@/components/admin/CRMTab";
import ConfigTab from "@/components/admin/ConfigTab";

/** Links úteis (configurável no Admin). */
const ADMIN_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Relatórios", href: "/relatorios" },
  // { label: "Site", href: "https://exemplo.com", external: true },
];

/** APIs e documentação externa. */
const ADMIN_APIS: { label: string; href: string; external?: boolean }[] = [
  // { label: "API Docs", href: "https://api.exemplo.com/docs", external: true },
];

const Admin = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [navRoles, setNavRoles] = useState<{ attendant: boolean; kitchen: boolean; admin: boolean }>({
    attendant: false,
    kitchen: false,
    admin: false,
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data: rolesList }) => {
        const r = (rolesList ?? []).map((x) => x.role);
        setIsAdmin(r.includes("admin"));
        setNavRoles({
          attendant: r.includes("attendant"),
          kitchen: r.includes("kitchen"),
          admin: r.includes("admin"),
        });
      });
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin === false) return <Navigate to="/" replace />;
  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-md px-4 py-3"
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl text-foreground leading-none">ADMIN</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Painel Administrativo</p>
            </div>
            {(navRoles.attendant || navRoles.kitchen || navRoles.admin) && (
              <div className="flex items-center gap-1.5 border-l border-border pl-3 ml-2">
                {navRoles.attendant && (
                  <button
                    onClick={() => navigate("/")}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Map className="h-3.5 w-3.5" /> Atendimento
                  </button>
                )}
                {navRoles.kitchen && (
                  <button
                    onClick={() => navigate("/cozinha")}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ChefHat className="h-3.5 w-3.5" /> Cozinha
                  </button>
                )}
                {navRoles.admin && (
                  <button
                    onClick={() => navigate("/admin")}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
                  >
                    <Settings className="h-3.5 w-3.5" /> Admin
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => navigate("/relatorios")}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </button>
        </div>
      </motion.header>

      <main className="mx-auto max-w-4xl p-4">
        <Tabs defaultValue="config" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="menu" className="gap-2 text-xs sm:text-sm">
              <UtensilsCrossed className="h-4 w-4" />
              <span className="hidden sm:inline">Cardápio</span>
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-2 text-xs sm:text-sm">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Mesas</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="password" className="gap-2 text-xs sm:text-sm">
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Senha</span>
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2 text-xs sm:text-sm">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="crm" className="gap-2 text-xs sm:text-sm">
              <Contact className="h-4 w-4" />
              <span className="hidden sm:inline">CRM</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Configuração</span>
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-2 text-xs sm:text-sm">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Links e APIs</span>
            </TabsTrigger>
            <button
              type="button"
              disabled
              title="Módulo Estoque em desenvolvimento"
              className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground/70 bg-muted/50 cursor-not-allowed opacity-70 border border-transparent"
            >
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Estoque</span>
            </button>
          </TabsList>

          <TabsContent value="menu"><MenuTab /></TabsContent>
          <TabsContent value="tables"><TablesTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="password"><ResetPasswordTab /></TabsContent>
          <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
          <TabsContent value="crm"><CRMTab /></TabsContent>
          <TabsContent value="config"><ConfigTab /></TabsContent>
          <TabsContent value="links" className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
                <Link2 className="h-4 w-4" />
                <span className="font-medium">Links</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ADMIN_LINKS.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhum link configurado. Edite ADMIN_LINKS em Admin.tsx.</span>
                ) : (
                  ADMIN_LINKS.map(({ label, href, external }) => (
                    <a
                      key={href + label}
                      href={href}
                      target={external ? "_blank" : undefined}
                      rel={external ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground hover:bg-muted hover:border-primary/40 transition-colors"
                    >
                      {label}
                      {(external === undefined || external) && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                    </a>
                  ))
                )}
              </div>
            </section>
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
                <Webhook className="h-4 w-4" />
                <span className="font-medium">APIs</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ADMIN_APIS.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhuma API configurada. Edite ADMIN_APIS em Admin.tsx.</span>
                ) : (
                  ADMIN_APIS.map(({ label, href, external }) => (
                    <a
                      key={href + label}
                      href={href}
                      target={external !== false ? "_blank" : undefined}
                      rel={external !== false ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground hover:bg-muted hover:border-primary/40 transition-colors"
                    >
                      {label}
                      {(external === undefined || external) && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                    </a>
                  ))
                )}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
