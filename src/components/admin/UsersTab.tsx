import { useState } from "react";
import { Flame, Shield, ShieldCheck, Search, Plus, Pencil, Trash2, Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAdminData, UserWithRole } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { SENHA_ABSOLUTA_MIN } from "@/constants/auth";

const ALL_ROLES = ["admin", "attendant", "kitchen"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  attendant: "Atendente",
  kitchen: "Cozinha",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/15 text-destructive border-destructive/30",
  attendant: "bg-primary/15 text-primary border-primary/30",
  kitchen: "bg-success/15 text-success-foreground border-success/30",
};

const formatCPF = (cpf: string) => {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
};

const formatCPFInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

type ModalMode = "create" | "edit" | "delete" | null;

const UsersTab = () => {
  const { users, loadingUsers, addRole, removeRole, refreshUsers } = useAdminData();
  const [search, setSearch] = useState("");

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formCpf, setFormCpf] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formRoles, setFormRoles] = useState<string[]>(["attendant"]);

  const openCreate = () => {
    setModalMode("create");
    setSelectedUser(null);
    setFormName("");
    setFormCpf("");
    setFormPassword("");
    setFormRoles(["attendant"]);
    setAdminPassword("");
    setShowAdminPassword(false);
    setShowFormPassword(false);
  };

  const openEdit = (user: UserWithRole) => {
    setModalMode("edit");
    setSelectedUser(user);
    setFormName(user.fullName);
    setFormPassword("");
    setAdminPassword("");
    setShowAdminPassword(false);
    setShowFormPassword(false);
  };

  const openDelete = (user: UserWithRole) => {
    setModalMode("delete");
    setSelectedUser(user);
    setAdminPassword("");
    setShowAdminPassword(false);
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedUser(null);
    setAdminPassword("");
  };

  const handleSubmit = async () => {
    if (!adminPassword) {
      toast.error("Digite sua senha de admin");
      return;
    }

    setFormLoading(true);
    try {
      let body: any = { admin_password: adminPassword };

      if (modalMode === "create") {
        const cpfDigits = formCpf.replace(/\D/g, "");
        if (cpfDigits.length !== 11) { toast.error("CPF inválido"); setFormLoading(false); return; }
        if (!formName.trim()) { toast.error("Nome obrigatório"); setFormLoading(false); return; }
        if (formPassword.length < SENHA_ABSOLUTA_MIN) {
          toast.error(`Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres`);
          setFormLoading(false);
          return;
        }

        body = { ...body, action: "create", full_name: formName.trim(), cpf: cpfDigits, password: formPassword, roles: formRoles };
      } else if (modalMode === "edit") {
        if (formPassword && formPassword.length < SENHA_ABSOLUTA_MIN) {
          toast.error(`Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres`);
          setFormLoading(false);
          return;
        }
        body = { ...body, action: "update", user_id: selectedUser!.userId, full_name: formName.trim() || undefined, new_password: formPassword || undefined };
      } else if (modalMode === "delete") {
        body = { ...body, action: "delete", user_id: selectedUser!.userId };
      }

      const { data, error } = await supabase.functions.invoke("manage-user", { body });

      if (error) {
        toast.error(error.message || "Erro na operação");
        setFormLoading(false);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setFormLoading(false);
        return;
      }

      toast.success(
        modalMode === "create" ? "Usuário criado" :
        modalMode === "edit" ? "Usuário atualizado" :
        "Usuário excluído"
      );
      closeModal();
      await refreshUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado");
    } finally {
      setFormLoading(false);
    }
  };

  const toggleFormRole = (role: string) => {
    setFormRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  if (loadingUsers) {
    return <div className="flex justify-center py-12"><Flame className="h-6 w-6 animate-pulse text-primary" /></div>;
  }

  const filtered = users.filter((u) =>
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.cpf.includes(search.replace(/\D/g, ""))
  );

  return (
    <div className="space-y-3">
      {/* Search + Add button */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF..."
            className="h-10 pl-9"
          />
        </div>
        <Button onClick={openCreate} size="icon" className="h-10 w-10 shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* User list */}
      {filtered.map((user) => (
        <div key={user.userId} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{formatCPF(user.cpf)}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => openEdit(user)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => openDelete(user)}
                className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((role) => {
              const hasRole = user.roles.includes(role);
              return (
                <button
                  key={role}
                  onClick={() => hasRole ? removeRole(user.userId, role) : addRole(user.userId, role)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                    hasRole ? ROLE_COLORS[role] : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {hasRole ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          {search ? "Nenhum resultado encontrado" : "Nenhum usuário encontrado"}
        </p>
      )}

      {/* Create / Edit / Delete Modal */}
      <Dialog open={modalMode !== null} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "create" && "Novo Usuário"}
              {modalMode === "edit" && "Editar Usuário"}
              {modalMode === "delete" && "Excluir Usuário"}
            </DialogTitle>
            <DialogDescription>
              {modalMode === "delete"
                ? `Tem certeza que deseja excluir "${selectedUser?.fullName}"? Esta ação não pode ser desfeita.`
                : modalMode === "edit"
                ? "Altere os dados do usuário. Deixe a senha em branco para manter a atual. Nova senha: mín. 12 caracteres (senha absoluta)."
                : "Registre o usuário e defina a atribuição. Exija senha absoluta (mín. 12 caracteres)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Create fields */}
            {modalMode === "create" && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Nome Completo</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">CPF</Label>
                  <Input
                    value={formCpf}
                    onChange={(e) => setFormCpf(formatCPFInput(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Senha absoluta (mín. {SENHA_ABSOLUTA_MIN} caracteres)</Label>
                  <div className="relative">
                    <Input
                      type={showFormPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder={`Mínimo ${SENHA_ABSOLUTA_MIN} caracteres`}
                      minLength={SENHA_ABSOLUTA_MIN}
                    />
                    <button type="button" onClick={() => setShowFormPassword(!showFormPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Atribuição (permissões)</Label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map((role) => {
                      const active = formRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleFormRole(role)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                            active ? ROLE_COLORS[role] : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          {active ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                          {ROLE_LABELS[role]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Edit fields */}
            {modalMode === "edit" && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Nome Completo</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Nova senha (opcional, senha absoluta mín. {SENHA_ABSOLUTA_MIN} caracteres)</Label>
                  <div className="relative">
                    <Input
                      type={showFormPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Deixe em branco para manter"
                    />
                    <button type="button" onClick={() => setShowFormPassword(!showFormPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Admin password confirmation (all actions) */}
            <div className="space-y-2 border-t border-border pt-4">
              <Label className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Sua senha de admin
              </Label>
              <div className="relative">
                <Input
                  type={showAdminPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Confirme com sua senha"
                />
                <button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeModal} disabled={formLoading}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={formLoading || !adminPassword}
              variant={modalMode === "delete" ? "destructive" : "default"}
            >
              {formLoading ? "Aguarde..." :
                modalMode === "create" ? "Criar" :
                modalMode === "edit" ? "Salvar" :
                "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersTab;
