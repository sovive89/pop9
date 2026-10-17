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
      .select("id, business_unit_id")
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
    // Reautenticar em outro cliente: não trocar o JWT do cliente service role.
    const passwordClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInError } = await passwordClient.auth.signInWithPassword({
      email: caller.email!,
      password: admin_password,
    });
    if (signInError) {
      return new Response(JSON.stringify({ error: "Senha de admin incorreta" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /** Senha absoluta: mínimo único para create/update de usuários pelo admin. */
    const SENHA_ABSOLUTA_MIN = 8;

    if (action === "create") {
      const { full_name, cpf, password, business_unit_id } = body;
      const roles = body.roles?.length ? body.roles : ["attendant"];
      if (!Array.isArray(roles) || !roles.every((role: unknown) =>
        typeof role === "string" && ["admin", "attendant", "kitchen", "cashier"].includes(role)
      )) {
        return new Response(JSON.stringify({ error: "Permissões inválidas" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!business_unit_id || (adminRole.business_unit_id && adminRole.business_unit_id !== business_unit_id)) {
        return new Response(JSON.stringify({ error: "Selecione uma unidade em que você seja administrador" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: unit, error: unitError } = await supabaseAdmin
        .from("business_units").select("id").eq("id", business_unit_id).eq("active", true).maybeSingle();
      if (unitError) throw unitError;
      if (!unit) {
        return new Response(JSON.stringify({ error: "Unidade inválida ou inativa" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!password || typeof password !== "string" || (password.length < SENHA_ABSOLUTA_MIN || !/[A-Z]/.test(password) || !/[^A-Za-z0-9\s]/.test(password))) {
        return new Response(JSON.stringify({ error: "Senha: mínimo de 8 caracteres, uma letra maiúscula e um caractere especial" }), {
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
      const { error: deleteRoleError } = await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
      const { error: insertRoleError } = deleteRoleError ? { error: deleteRoleError } :
        await supabaseAdmin.from("user_roles").insert(
          [...new Set(roles as string[])].map((role) => ({ user_id: newUser.user.id, role, business_unit_id }))
        );
      if (insertRoleError) {
        const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        if (rollbackError) console.error("Erro ao desfazer cadastro sem permissões:", rollbackError);
        throw insertRoleError;
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
        if (new_password.length < SENHA_ABSOLUTA_MIN || !/[A-Z]/.test(new_password) || !/[^A-Za-z0-9\s]/.test(new_password)) {
          return new Response(JSON.stringify({ error: "Senha: mínimo de 8 caracteres, uma letra maiúscula e um caractere especial" }), {
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
