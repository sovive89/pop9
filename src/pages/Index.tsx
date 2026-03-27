import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Flame, LogOut, Settings, Map, ClipboardList, ChefHat, Bell, Package, BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import TableMap from "@/components/TableMap";
import ActiveOrdersPanel from "@/components/ActiveOrdersPanel";
import DashboardStats from "@/components/DashboardStats";
import NotificationBell from "@/components/NotificationBell";
import { useSessionStore } from "@/hooks/useSessionStore";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { sessions } = useSessionStore();
  const [roles, setRoles] = useState<{ admin: boolean; attendant: boolean; kitchen: boolean }>({
    admin: false,
    attendant: false,
    kitchen: false,
  });
  const [profileName, setProfileName] = useState("");
  const [tab, setTab] = useState<"mesas" | "pedidos">("mesas");
  usePushNotifications(user?.id);

  const { readyCount, readyDeliveryCount } = useMemo(() => {
    let mesa = 0;
    let delivery = 0;
    for (const sd of Object.values(sessions)) {
      for (const co of sd.orders) {
        for (const o of co.orders) {
          if (o.status !== "ready") continue;
          if (o.origin === "pwa") delivery++;
          else mesa++;
        }
      }
    }
    return { readyCount: mesa + delivery, readyDeliveryCount: delivery };
  }, [sessions]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data: rolesList }) => {
        const r = (rolesList ?? []).map((x) => x.role);
        setRoles({
          admin: r.includes("admin"),
          attendant: r.includes("attendant"),
          kitchen: r.includes("kitchen"),
        });
      });
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfileName(data?.full_name ?? ""));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Flame className="h-10 w-10 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-md px-4 py-3"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl text-foreground leading-none">PØP9</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Atendente</p>
            </div>
            <AnimatePresence>
              {readyCount > 0 && (
                <>
                  {readyCount - readyDeliveryCount > 0 && (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      onClick={() => setTab("pedidos")}
                      className="relative flex items-center gap-1.5 rounded-lg bg-success/15 border border-success/40 px-2.5 py-1.5 text-success-foreground text-xs font-semibold"
                    >
                      <Bell className="h-3.5 w-3.5 animate-pulse" />
                      {readyCount - readyDeliveryCount} {readyCount - readyDeliveryCount === 1 ? "pronto" : "prontos"}
                    </motion.button>
                  )}
                  {readyDeliveryCount > 0 && (
                    <motion.button
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      onClick={() => setTab("pedidos")}
                      className="relative flex items-center gap-1.5 rounded-lg bg-primary/15 border border-primary/40 px-2.5 py-1.5 text-primary-foreground text-xs font-semibold"
                    >
                      <Package className="h-3.5 w-3.5 animate-pulse" />
                      {readyDeliveryCount} delivery {readyDeliveryCount === 1 ? "pronto" : "prontos"}
                    </motion.button>
                  )}
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {profileName && (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase">
                  {profileName.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("")}
                </div>
                <span className="text-sm font-medium text-foreground hidden sm:inline max-w-[120px] truncate">
                  {profileName.split(" ")[0]}
                </span>
              </div>
            )}
            {(roles.attendant || roles.kitchen || roles.admin) && (
              <div className="flex items-center gap-1.5">
                {roles.attendant && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/")}
                    className="gap-1.5 border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    <Map className="h-4 w-4" />
                    <span className="hidden sm:inline">Atendimento</span>
                  </Button>
                )}
                {(roles.kitchen || roles.admin) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/cozinha")}
                    className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
                  >
                    <ChefHat className="h-4 w-4" />
                    <span className="hidden sm:inline">Cozinha</span>
                  </Button>
                )}
                {roles.admin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/relatorios")}
                      className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Relatorios</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/admin")}
                      className="gap-1.5 border-border text-muted-foreground hover:text-foreground"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="hidden sm:inline">Admin</span>
                    </Button>
                  </>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="gap-2 border-border text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Tab bar */}
      <div className="sticky top-[65px] z-10 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex">
          {([
            { key: "mesas" as const, label: "Mesas", icon: Map },
            { key: "pedidos" as const, label: "Pedidos", icon: ClipboardList },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl p-4 pb-6">
        {/* Dashboard Stats - sempre visivel */}
        <DashboardStats />
        
        {/* Tab content */}
        {tab === "mesas" ? <TableMap /> : <ActiveOrdersPanel />}
      </main>
    </div>
  );
};

export default Index;
