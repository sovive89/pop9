import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Flame } from "lucide-react";

/**
 * Rota para onde o Supabase redireciona após:
 * - Confirmação de e-mail (signup)
 * - Clique no link de recuperação de senha
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace("#", ""));
    const type = params.get("type");

    const finish = (path: string) => {
      setStatus("ok");
      window.history.replaceState(null, "", window.location.pathname);
      navigate(path, { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      if (type === "recovery") {
        finish("/recuperar-senha");
      } else {
        finish("/");
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus("error");
        navigate("/login", { replace: true });
        return;
      }
      if (session) {
        if (type === "recovery") finish("/recuperar-senha");
        else finish("/");
        return;
      }
      if (!hash || !params.get("access_token")) {
        setStatus("error");
        navigate("/login", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary">
          <Flame className="h-10 w-10 text-primary-foreground" />
        </div>
        <p className="text-muted-foreground">
          {status === "loading" && "Confirmando..."}
          {status === "ok" && "Redirecionando..."}
          {status === "error" && "Algo deu errado. Redirecionando para o login."}
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
