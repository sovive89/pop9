import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { SENHA_ABSOLUTA_MIN } from "@/constants/auth";

const RecuperarSenha = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setChecking(false);
      if (!session) {
        toast.error("Link expirado ou inválido. Solicite uma nova recuperação de senha.");
        navigate("/login", { replace: true });
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < SENHA_ABSOLUTA_MIN) {
      toast.error(`Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha alterada com sucesso. Faça login.");
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      toast.error(msg || "Erro ao alterar senha. O link pode ter expirado.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary">
            <Flame className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl text-foreground">Pøp9</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Defina uma nova senha para sua conta.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Mínimo ${SENHA_ABSOLUTA_MIN} caracteres`}
                  required
                  minLength={SENHA_ABSOLUTA_MIN}
                  autoComplete="new-password"
                  className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-sm font-medium text-muted-foreground">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
                minLength={SENHA_ABSOLUTA_MIN}
                autoComplete="new-password"
                className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
              />
            </div>
            <Button type="submit" disabled={loading} className="h-12 w-full text-lg font-semibold">
              {loading ? "Salvando..." : "Alterar senha"}
            </Button>
          </form>
          <p className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Voltar ao login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RecuperarSenha;
