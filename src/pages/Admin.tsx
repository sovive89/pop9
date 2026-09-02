import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Flame,
  Users,
  UtensilsCrossed,
  KeyRound,
  BarChart3,
  Package,
  Map,
  ChefHat,
  Settings,
  Link2,
  Webhook,
  ExternalLink,
  MessageCircle,
  Contact,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MenuTab from "@/components/admin/MenuTab";
import UsersTab from "@/components/admin/UsersTab";
import ResetPasswordTab from "@/components/admin/ResetPasswordTab";
import WhatsAppTab from "@/components/admin/WhatsAppTab";
import CRMTab from "@/components/admin/CRMTab";
import StockTab from "@/components/admin/StockTab";
import PrintersTab from "@/components/admin/PrintersTab";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

/** Links úteis (configurável no Admin). */
const ADMIN_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Relatórios", href: "/relatorios" },
  // { label: "Site", href: "https://exemplo.com", external: true },
];

/** APIs e documentação externa. */
const ADMIN_APIS: { label: string; href: string; external?: boolean }[] = [
  // { label: "API Docs", href: "https://api.exemplo.com/docs", external: true },
];

type SectionKey = "menu" | "users" | "password" | "whatsapp" | "crm" | "stock" | "printers" | "links";

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "menu", label: "Cardápio", icon: UtensilsCrossed },
  { key: "users", label: "Usuários", icon: Users },
  { key: "password", label: "Senha", icon: KeyRound },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "crm", label: "CRM", icon: Contact },
  { key: "stock", label: "Estoque", icon: Package },
  { key: "printers", label: "Impressoras", icon: Printer },
  { key: "links", label: "Links e APIs", icon: Link2 },
];

/**
 * Item de menu da sidebar. Fica em componente próprio (em vez de inline no
 * map) só porque precisa do hook useSidebar() para fechar o menu mobile
 * (o Sheet) depois de escolher uma seção — e hooks só podem ser chamados
 * dentro de um componente que é filho do SidebarProvider.
 */
function SectionMenuButton({
  section,
  isActive,
  onSelect,
}: {
  section: (typeof SECTIONS)[number];
  isActive: boolean;
  onSelect: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = section.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={section.label}
        onClick={() => {
          onSelect();
          if (isMobile) setOpenMobile(false);
        }}
      >
        <Icon />
        <span>{section.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const Admin = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [navRoles, setNavRoles] = useState<{ attendant: boolean; kitchen: boolean; admin: boolean }>({
    attendant: false,
    kitchen: false,
    admin: false,
  });
  const [activeSection, setActiveSection] = useState<SectionKey>("menu");

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

  const activeLabel = SECTIONS.find((s) => s.key === activeSection)?.label ?? "";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-semibold leading-none text-sidebar-foreground">ADMIN</p>
              <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">Painel</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Módulos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTIONS.map((section) => (
                  <SectionMenuButton
                    key={section.key}
                    section={section}
                    isActive={activeSection === section.key}
                    onSelect={() => setActiveSection(section.key)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {(navRoles.attendant || navRoles.kitchen) && (
            <SidebarGroup>
              <SidebarGroupLabel>Trocar de painel</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navRoles.attendant && (
                    <SidebarMenuItem>
                      <SidebarMenuButton tooltip="Atendimento" onClick={() => navigate("/")}>
                        <Map />
                        <span>Atendimento</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {navRoles.kitchen && (
                    <SidebarMenuItem>
                      <SidebarMenuButton tooltip="Cozinha" onClick={() => navigate("/cozinha")}>
                        <ChefHat />
                        <span>Cozinha</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Relatórios" onClick={() => navigate("/relatorios")}>
                <BarChart3 />
                <span>Relatórios</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/80 backdrop-blur-md px-4 py-3"
        >
          <SidebarTrigger />
          <div className="h-5 w-px bg-border" />
          <h1 className="text-lg font-medium text-foreground truncate">{activeLabel}</h1>

          <div className="ml-auto flex items-center gap-1.5">
            {navRoles.admin && (
              <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                <Settings className="h-3.5 w-3.5" /> Admin
              </span>
            )}
            <button
              onClick={() => navigate("/relatorios")}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Relatórios</span>
            </button>
          </div>
        </motion.header>

        <main className="flex-1 p-4">
          <div className="mx-auto max-w-4xl">
            {activeSection === "menu" && <MenuTab />}
            {activeSection === "users" && <UsersTab />}
            {activeSection === "password" && <ResetPasswordTab />}
            {activeSection === "whatsapp" && <WhatsAppTab />}
            {activeSection === "crm" && <CRMTab />}
            {activeSection === "stock" && <StockTab />}
            {activeSection === "printers" && <PrintersTab />}
            {activeSection === "links" && (
              <div className="space-y-6">
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
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Admin;
