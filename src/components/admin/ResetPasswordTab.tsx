import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminData } from "@/hooks/useAdminData";
import { toast } from "sonner";
import { SENHA_ABSOLUTA_MIN } from "@/constants/auth";

const formatCPF = (cpf: string) => {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
};

const ResetPasswordTab = () => {
  const { users, resetPassword } = useAdminData();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedUser = users.find((u) => u.userId === selectedUserId);

  const handleReset = async () => {
    if (!selectedUser) { toast.error("Selecione um usuário"); return; }
    if (newPassword.length < SENHA_ABSOLUTA_MIN) { toast.error(`Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres`); return; }
    setLoading(true);
    const ok = await resetPassword(selectedUser.cpf, newPassword);
    if (ok) {
      setNewPassword("");
      setSelectedUserId("");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Usuário</label>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="w-full h-11 rounded-lg border border-border bg-muted px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Selecione um usuário</option>
          {users.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.fullName} ({formatCPF(u.cpf)})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Nova Senha</label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`Mínimo ${SENHA_ABSOLUTA_MIN} caracteres`}
            minLength={SENHA_ABSOLUTA_MIN}
            className="h-11 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button onClick={handleReset} disabled={loading || !selectedUserId} className="gap-2">
        <KeyRound className="h-4 w-4" />
        {loading ? "Aguarde..." : "Redefinir Senha"}
      </Button>
    </div>
  );
};

export default ResetPasswordTab;
