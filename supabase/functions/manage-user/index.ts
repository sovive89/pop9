import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Sem permissão de admin" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, admin_password } = body;

    // Verify admin password
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: caller.email!,
      password: admin_password,
    });
    if (signInError) {
      return new Response(JSON.stringify({ error: "Senha de admin incorreta" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /** Senha absoluta: mínimo único para create/update de usuários pelo admin. */
    const SENHA_ABSOLUTA_MIN = 12;

    if (action === "create") {
      const { full_name, cpf, password, roles } = body;
      if (!password || typeof password !== "string" || password.length < SENHA_ABSOLUTA_MIN) {
        return new Response(JSON.stringify({ error: `Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const email = `${cpf}@burgerhouse.sys`;

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, cpf },
      });

      if (createError) {
        const msg = createError.message.includes("already been registered")
          ? "CPF já cadastrado"
          : createError.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove default role added by trigger, then add selected roles
      if (roles && roles.length > 0) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
        await supabaseAdmin.from("user_roles").insert(
          roles.map((role: string) => ({ user_id: newUser.user.id, role }))
        );
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, full_name, new_password } = body;

      // Update profile
      if (full_name) {
        await supabaseAdmin.from("profiles").update({ full_name }).eq("user_id", user_id);
      }

      // Update password if provided (exige senha absoluta)
      if (new_password) {
        if (new_password.length < SENHA_ABSOLUTA_MIN) {
          return new Response(JSON.stringify({ error: `Senha absoluta: mínimo ${SENHA_ABSOLUTA_MIN} caracteres` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
          password: new_password,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = body;

      // Prevent self-delete
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Não é possível excluir a si mesmo" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
