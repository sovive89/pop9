import { useState } from "react";
import { Flame, Shield, ShieldCheck, Search, Plus, Pencil, Trash2, Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAdminData, UserWithRole } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentBusinessUnit } from "@/hooks/useCurrentBusinessUnit";
import { toast } from "sonner";

import { SENHA_ABSOLUTA_MIN, SENHA_REQUISITOS, senhaValida } from "@/constants/auth";

const ALL_ROLES = ["admin", "attendant", "kitchen", "cashier"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  attendant: "Atendente",
  kitchen: "Cozinha",
  cashier: "Caixa",
};
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-destructive/15 text-destructive border-destructive/30",
  attendant: "bg-primary/15 text-primary border-primary/30",
  kitchen: "bg-success/15 text-success-foreground border-success/30",
  cashier: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
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

type ManageUserPayload =
  | { admin_password: string }
  | {
      admin_password: string;
      action: "create";
      full_name: string;
      cpf: string;
      password: string;
      roles: string[];
      business_unit_id: string;
    }
  | {
      admin_password: string;
      action: "update";
      user_id: string;
      full_name?: string;
      new_password?: string;
    }
  | { admin_password: string; action: "delete"; user_id: string };

type ManageUserResponse =
  | { success: true; user_id?: string }
  | { error: string };

type ErrorWithMessage = { message: string };

const isErrorWithMessage = (value: unknown): value is ErrorWithMessage =>
  typeof value === "object" &&
  value !== null &&
  "message" in value &&
  typeof value.message === "string";

const UsersTab = () => {
  const { businessUnitId } = useCurrentBusinessUnit();
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
      let body: ManageUserPayload = { admin_password: adminPassword };

      if (modalMode === "create") {
        if (!businessUnitId) { toast.error("Selecione uma unidade para cadastrar o usuário"); setFormLoading(false); return; }
        const cpfDigits = formCpf.replace(/\D/g, "");
        if (cpfDigits.length !== 11) { toast.error("CPF inválido"); setFormLoading(false); return; }
        if (!formName.trim()) { toast.error("Nome obrigatório"); setFormLoading(false); return; }
        if (!senhaValida(formPassword)) {
          toast.error(SENHA_REQUISITOS);
          setFormLoading(false);
          return;
        }

        body = {
          admin_password: adminPassword,
          action: "create",
          full_name: formName.trim(),
          cpf: cpfDigits,
          password: formPassword,
          roles: formRoles,
          business_unit_id: businessUnitId,
        };
      } else if (modalMode === "edit") {
        if (formPassword && !senhaValida(formPassword)) {
          toast.error(SENHA_REQUISITOS);
          setFormLoading(false);
          return;
        }
        body = {
          admin_password: adminPassword,
          action: "update",
          user_id: selectedUser!.userId,
          full_name: formName.trim() || undefined,
          new_password: formPassword || undefined,
        };
      } else if (modalMode === "delete") {
        body = {
          admin_password: adminPassword,
          action: "delete",
          user_id: selectedUser!.userId,
        };
      }

      const { data, error } = await supabase.functions.invoke<ManageUserResponse>("manage-user", { body });

      if (error) {
        toast.error(error.message || "Erro na operação");
        setFormLoading(false);
        return;
      }
      if (data && "error" in data) {
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
    } catch (err: unknown) {
      toast.error(isErrorWithMessage(err) ? err.message : "Erro inesperado");
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
        <Button data-tooltip="Cadastre um novo funcionário e configure seus acessos." aria-label="Cadastre um novo funcionário e configure seus acessos." onClick={openCreate} size="icon" className="h-10 w-10 shrink-0">
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
              <button data-tooltip="Edite o cadastro deste funcionário." aria-label="Edite o cadastro deste funcionário."
                onClick={() => openEdit(user)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button data-tooltip="Abra a confirmação para excluir este funcionário." aria-label="Abra a confirmação para excluir este funcionário."
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
                <button data-tooltip="Ative ou remova este perfil de acesso para o funcionário." aria-label="Ative ou remova este perfil de acesso para o funcionário."
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
                ? "Altere os dados do usuário. Deixe a senha em branco para manter a atual. Nova senha: mínimo de 8 caracteres, uma maiúscula e um caractere especial."
                : "Registre o usuário e defina a atribuição. Exija senha de 8 caracteres, uma maiúscula e um caractere especial."}
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
                    <button data-tooltip="Mostre ou oculte a senha digitada." aria-label="Mostre ou oculte a senha digitada." type="button" onClick={() => setShowFormPassword(!showFormPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
                        <button data-tooltip="Ative ou remova este perfil de acesso para o funcionário." aria-label="Ative ou remova este perfil de acesso para o funcionário."
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
                    <button data-tooltip="Mostre ou oculte a senha digitada." aria-label="Mostre ou oculte a senha digitada." type="button" onClick={() => setShowFormPassword(!showFormPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
                <button data-tooltip="Mostre ou oculte a senha digitada." aria-label="Mostre ou oculte a senha digitada." type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeModal} disabled={formLoading}>Cancelar</Button>
            <Button data-tooltip="Salve os dados preenchidos e continue para a próxima etapa."
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
