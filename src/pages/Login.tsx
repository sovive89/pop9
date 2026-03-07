import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { SENHA_ABSOLUTA_MIN } from "@/constants/auth";

type View = "login" | "signup" | "forgot";

const validateEmail = (email: string) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEsqueciSenhaPage = location.pathname === "/esqueci-senha";
  const [view, setView] = useState<View>(() => (isEsqueciSenhaPage ? "forgot" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEsqueciSenhaPage) setView("forgot");
  }, [isEsqueciSenhaPage]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error("Digite um e-mail válido");
      return;
    }
    if (!password) {
      toast.error("Digite a senha");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
        toast.error("E-mail ou senha incorretos");
      } else if (msg.includes("Email not confirmed") || msg.includes("email_not_confirmed")) {
        toast.error("E-mail ainda não confirmado. Verifique sua caixa de entrada e clique no link que enviamos.");
      } else {
        toast.error(msg || "Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error("Digite um e-mail válido");
      return;
    }
    if (fullName.trim().length < 3) {
      toast.error("Nome deve ter pelo menos 3 caracteres");
      return;
    }
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
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
      toast.success("Conta criada! Verifique seu e-mail e clique no link para confirmar.");
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      if (msg.includes("already registered") || msg.includes("already exists")) {
        toast.error("Este e-mail já está cadastrado");
      } else {
        toast.error(msg || "Erro ao criar conta");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      toast.error("Digite um e-mail válido");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
      if (error) throw error;
      toast.success("Enviamos um link para o seu e-mail. Verifique a caixa de entrada e o spam.");
      setView("login");
      setEmail("");
      if (isEsqueciSenhaPage) navigate("/login", { replace: true });
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      if (msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("rate_limit")) {
        toast.error("Muitas tentativas. Aguarde alguns minutos antes de solicitar outro link.");
      } else {
        toast.error(msg || "Erro ao enviar e-mail. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const switchView = (v: View) => {
    setView(v);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setShowPassword(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary"
          >
            <Flame className="h-10 w-10 text-primary-foreground" />
          </motion.div>
          <h1 className="text-5xl text-foreground">Pøp9</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema de Gestão de Pedidos
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-border bg-card p-8">
          <AnimatePresence mode="wait">
            {view === "login" && (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mb-6 text-center text-3xl text-foreground">ENTRAR</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-muted-foreground">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">Senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={1}
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
                  <Button type="submit" disabled={loading} className="h-12 w-full text-lg font-semibold">
                    {loading ? "Aguarde..." : "Entrar"}
                  </Button>
                </form>
                <div className="mt-6 flex flex-col items-center gap-2">
                  <button type="button" onClick={() => setView("forgot")} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Esqueci a senha
                  </button>
                  <button type="button" onClick={() => switchView("signup")} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Não tem conta? <span className="text-primary font-medium">Cadastre-se</span>
                  </button>
                </div>
              </motion.div>
            )}

            {view === "forgot" && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <button
                    type="button"
                    onClick={() => (isEsqueciSenhaPage ? navigate("/login") : setView("login"))}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-2xl text-foreground flex-1 text-center pr-5">RECUPERAR SENHA</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  Digite seu e-mail e enviaremos um link para redefinir a senha.
                </p>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-sm font-medium text-muted-foreground">E-mail</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="h-12 w-full text-lg font-semibold gap-2">
                    <Mail className="h-5 w-5" />
                    {loading ? "Enviando..." : "Enviar link"}
                  </Button>
                </form>
              </motion.div>
            )}

            {view === "signup" && (
              <motion.div
                key="signup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <button onClick={() => switchView("login")} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-3xl text-foreground flex-1 text-center pr-5">CADASTRO</h2>
                </div>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Nome Completo</Label>
                    <Input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome completo"
                      required
                      maxLength={100}
                      className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">E-mail</Label>
                    <Input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Senha</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`Mínimo ${SENHA_ABSOLUTA_MIN} caracteres`}
                        required
                        minLength={SENHA_ABSOLUTA_MIN}
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
                    <Label className="text-sm font-medium text-muted-foreground">Confirmar Senha</Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      required
                      minLength={SENHA_ABSOLUTA_MIN}
                      className="h-12 bg-muted border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="h-12 w-full text-lg font-semibold">
                    {loading ? "Aguarde..." : "Criar Conta"}
                  </Button>
                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
