import { useState, useEffect } from "react";
import OperationControl from "@/components/OperationControl";
import { PAGE_HELP } from "@/lib/page-help";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
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
  Banknote,
  Settings,
  ToggleRight,
  Palette,
  Plug,
  Network,
  Contact,
  Printer,
  QrCode,
  Building2,
  FolderOpen,
  Receipt,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUnitRoles } from "@/hooks/useUnitRoles";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import MenuTab from "@/components/admin/MenuTab";
import UsersTab from "@/components/admin/UsersTab";
import ResetPasswordTab from "@/components/admin/ResetPasswordTab";
import { ConnectionsTab } from "@/components/admin/ConnectionsTab";
import { Pop9HubTab } from "@/components/admin/Pop9HubTab";
import CRMTab from "@/components/admin/CRMTab";
import StockTab from "@/components/admin/StockTab";
import PrintersTab from "@/components/admin/PrintersTab";
import QrCodesTab from "@/components/admin/QrCodesTab";
import BusinessUnitsTab from "@/components/admin/BusinessUnitsTab";
import DocumentsTab from "@/components/admin/DocumentsTab";
import SettingsTab from "@/components/admin/SettingsTab";
import CombosTab from "@/components/admin/CombosTab";
import FinanceTab from "@/components/admin/FinanceTab";
import { useUnitModules, type OptionalModule } from "@/hooks/useUnitModules";
import BrandTab from "@/components/admin/BrandTab";
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

type SectionKey = "menu" | "combos" | "users" | "password" | "connections" | "hub" | "crm" | "stock" | "printers" | "qrcodes" | "units" | "documents" | "settings" | "brand" | "finance";

// Subgrupos do menu "Configurações". `hub` segue fora do menu (acessível por ?sec=hub), como já era.
const SETTINGS_GROUPS: { label: string; keys: SectionKey[] }[] = [
  { label: "Equipe e acesso", keys: ["users", "password"] },
  { label: "Estabelecimento", keys: ["units", "brand", "qrcodes", "printers"] },
  { label: "Sistema", keys: ["settings", "connections"] },
];
const SETTINGS_KEYS: SectionKey[] = SETTINGS_GROUPS.flatMap(group => group.keys);

const SECTIONS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: "menu", label: "Cardápio", icon: UtensilsCrossed },
  { key: "combos", label: "Combos", icon: Layers },
  { key: "users", label: "Usuários", icon: Users },
  { key: "password", label: "Senha", icon: KeyRound },
  { key: "connections", label: "Conexões", icon: Plug },
  { key: "hub", label: "Pop9 Hub", icon: Network },
  { key: "crm", label: "CRM", icon: Contact },
  { key: "stock", label: "Estoque", icon: Package },
  { key: "printers", label: "Impressoras", icon: Printer },
  { key: "documents", label: "Central de Documentos", icon: FolderOpen },
  { key: "qrcodes", label: "QR Codes", icon: QrCode },
  { key: "units", label: "Unidades", icon: Building2 },
  { key: "settings", label: "Módulos", icon: ToggleRight },
  { key: "brand", label: "Marca", icon: Palette },
  { key: "finance", label: "Financeiro", icon: Banknote },
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
  const descriptions: Record<SectionKey, string> = {
    menu: "Gerencie produtos e categorias do cardápio.", combos: "Monte combos com itens do cardápio e preço especial.", users: "Gerencie os acessos dos funcionários.", password: "Altere as credenciais de acesso.", connections: "Configure integrações externas.", hub: "Integração futura com o Pop9 Hub.", crm: "Consulte e organize os clientes.", stock: "Controle insumos e movimentações.", printers: "Cadastre impressoras e configure os gatilhos disponíveis.", documents: "Exporte o cardápio, baixe imagens e consulte os documentos do estabelecimento.", qrcodes: "Gerencie os códigos QR.", units: "Gerencie as unidades do estabelecimento.", settings: "Ative ou desative módulos da unidade, como o KDS da cozinha e a estação de impressão.", brand: "Logo, fundo e cores do cardápio que o cliente vê.", finance: "Painel de CMV, margem, custos fixos, previsão e insights."
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={`${section.label} — ${PAGE_HELP[section.key]}`}
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
  const { roles, loading: rolesLoading, error: rolesError } = useUnitRoles();
  const { businessUnitId } = useCurrentBusinessUnit();
  const isAdmin = roles.includes("admin");
  const navRoles = { attendant: isAdmin || roles.includes("attendant"), kitchen: isAdmin || roles.includes("kitchen"), admin: isAdmin };
  const modules = useUnitModules();
  const moduleOn = (key: string) => !(["financeiro", "combos", "crm", "documents"] as const).some((m) => (key === "finance" ? "financeiro" : key) === m && !modules.isEnabled(m as OptionalModule));
  const [showSettings, setShowSettings] = useState(false);
  const [searchParams,setSearchParams] = useSearchParams();
  const requestedSection=searchParams.get("sec");
  const activeSection:SectionKey = SECTIONS.some(s=>s.key===requestedSection) && moduleOn(requestedSection ?? "") ? requestedSection as SectionKey : "menu";
  const setActiveSection=(section:SectionKey)=>setSearchParams({sec:section});

  useEffect(() => {
    if (SETTINGS_KEYS.includes(activeSection)) setShowSettings(true);
  }, [activeSection]);

  if (loading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (rolesError) return <p role="alert" className="p-6">Não foi possível verificar suas permissões. Recarregue a página.</p>;
  if (!businessUnitId) return <p className="p-6">Selecione uma unidade para acessar a administração.</p>;
  if (!isAdmin) return <Navigate to="/" replace />;

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
            <SidebarGroupLabel>Operação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTIONS.filter(section => ["menu", "combos", "stock", "crm", "documents", "finance"].includes(section.key) && moduleOn(section.key)).map((section) => (
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

          <SidebarGroup>
            <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Configurações" aria-expanded={showSettings} aria-controls="admin-settings" onClick={() => setShowSettings(value => !value)}><Settings /><span>Configurações</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
            {showSettings && <SidebarGroupContent id="admin-settings">
              {SETTINGS_GROUPS.map(group => <div key={group.label} className="mt-1">
                <p className="px-2 pt-1 text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">{group.label}</p>
                <SidebarMenu>
                  {group.keys.map(key => SECTIONS.find(section => section.key === key)).filter((section): section is (typeof SECTIONS)[number] => Boolean(section)).map(section => <SectionMenuButton key={section.key} section={section} isActive={activeSection === section.key} onSelect={() => setActiveSection(section.key)} />)}
                </SidebarMenu>
              </div>)}
            </SidebarGroupContent>}
          </SidebarGroup>

          {(navRoles.attendant || navRoles.kitchen || navRoles.admin) && (
            <SidebarGroup>
              <SidebarGroupLabel>Trocar de painel</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navRoles.admin && <SidebarMenuItem><SidebarMenuButton tooltip="Caixa" onClick={() => navigate("/caixa")}><Receipt /><span>Caixa</span></SidebarMenuButton></SidebarMenuItem>}
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
          <h1 tabIndex={0} data-tooltip={PAGE_HELP[activeSection]} className="text-lg font-medium text-foreground truncate">{activeLabel}</h1>

          <div className="ml-auto flex items-center gap-1.5">
            <button data-tooltip="Consulte os indicadores e relatórios da operação."
              onClick={() => navigate("/relatorios")}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden"
              aria-label="Relatórios"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          </div>
        </motion.header>

        <main className="flex-1 p-4">
          <div className={activeSection === "connections" ? "mx-auto max-w-6xl" : "mx-auto max-w-4xl"}>
            <div className="mb-4"><OperationControl /></div>
            {activeSection === "menu" && <MenuTab />}
            {activeSection === "users" && <UsersTab />}
            {activeSection === "password" && <ResetPasswordTab />}
            {activeSection === "crm" && <CRMTab />}
            {activeSection === "stock" && <StockTab />}
            {activeSection === "printers" && <PrintersTab />}
            {activeSection === "documents" && <DocumentsTab />}
            {activeSection === "qrcodes" && <QrCodesTab />}
            {activeSection === "units" && <BusinessUnitsTab />}
            {activeSection === "connections" && <ConnectionsTab />}
            {activeSection === "hub" && <Pop9HubTab />}
            {activeSection === "combos" && <CombosTab />}
            {activeSection === "finance" && <FinanceTab />}
            {activeSection === "settings" && <SettingsTab />}
            {activeSection === "brand" && <BrandTab />}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Admin;
