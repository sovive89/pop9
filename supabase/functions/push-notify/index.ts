import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push crypto helpers using Web Crypto API
async function generatePushPayload(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidKeys: { publicKey: string; privateKey: string }
) {
  // For simplicity and reliability, we use the fetch-based approach
  // with VAPID headers and encrypted payload via web-push compatible format
  const endpoint = subscription.endpoint;

  // Create VAPID JWT
  const audience = new URL(endpoint).origin;
  const vapidJwt = await createVapidJwt(audience, vapidKeys.privateKey, `mailto:noreply@tablemate.app`);

  // Encrypt payload
  const encrypted = await encryptPayload(
    payload,
    subscription.p256dh,
    subscription.auth
  );

  return {
    endpoint,
    headers: {
      Authorization: `vapid t=${vapidJwt}, k=${vapidKeys.publicKey}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    body: encrypted,
  };
}

// Base64url encode/decode
function base64urlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readDerLength(bytes: Uint8Array, start: number): { length: number; next: number } {
  const first = bytes[start];
  if ((first & 0x80) === 0) {
    return { length: first, next: start + 1 };
  }
  const octets = first & 0x7f;
  let length = 0;
  for (let i = 0; i < octets; i++) {
    length = (length << 8) | bytes[start + 1 + i];
  }
  return { length, next: start + 1 + octets };
}

function derToJose(derSig: Uint8Array, partLength = 32): Uint8Array {
  let offset = 0;
  if (derSig[offset++] !== 0x30) {
    throw new Error("Invalid DER signature format");
  }

  const seqLen = readDerLength(derSig, offset);
  offset = seqLen.next;

  if (derSig[offset++] !== 0x02) {
    throw new Error("Invalid DER signature format");
  }
  const rLen = readDerLength(derSig, offset);
  offset = rLen.next;
  let r = derSig.slice(offset, offset + rLen.length);
  offset += rLen.length;

  if (derSig[offset++] !== 0x02) {
    throw new Error("Invalid DER signature format");
  }
  const sLen = readDerLength(derSig, offset);
  offset = sLen.next;
  let s = derSig.slice(offset, offset + sLen.length);

  // Remove DER sign-padding (leading zeros), then left-pad to fixed width.
  while (r.length > 0 && r[0] === 0) r = r.slice(1);
  while (s.length > 0 && s[0] === 0) s = s.slice(1);
  if (r.length > partLength || s.length > partLength) {
    throw new Error("Invalid ECDSA signature length");
  }

  const jose = new Uint8Array(partLength * 2);
  jose.set(r, partLength - r.length);
  jose.set(s, partLength * 2 - s.length);
  return jose;
}

async function createVapidJwt(audience: string, privateKeyBase64: string, subject: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 86400, sub: subject };

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const unsignedToken = `${headerB64}.${claimsB64}`;

  // Import private key
  const rawKey = base64urlDecode(privateKeyBase64);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    rawKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );

  // WebCrypto returns DER for ECDSA; JWT ES256 requires JOSE (r||s).
  const sig = new Uint8Array(signature);
  const sigJose = derToJose(sig, 32);
  const sigB64 = base64urlEncode(sigJose);

  return `${unsignedToken}.${sigB64}`;
}

// Simplified payload encryption for Web Push (aes128gcm)
async function encryptPayload(
  payload: string,
  p256dhBase64: string,
  authBase64: string
): Promise<Uint8Array> {
  const userPublicKey = base64urlDecode(p256dhBase64);
  const userAuth = base64urlDecode(authBase64);

  // Generate local ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export local public key
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import subscriber's public key
  const subscriberKey = await crypto.subtle.importKey(
    "raw",
    userPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberKey },
      localKeyPair.privateKey,
      256
    )
  );

  // HKDF for auth secret
  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const authInfoFull = new Uint8Array(authInfo.length + userPublicKey.length + localPublicKeyRaw.length);
  authInfoFull.set(authInfo);
  authInfoFull.set(userPublicKey, authInfo.length);
  authInfoFull.set(localPublicKeyRaw, authInfo.length + userPublicKey.length);

  const ikm = await hkdf(userAuth, sharedSecret, authInfoFull, 32);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key and nonce
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // Encrypt with AES-128-GCM
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);

  const paddedPayload = new Uint8Array(new TextEncoder().encode(payload).length + 1);
  paddedPayload.set(new TextEncoder().encode(payload));
  paddedPayload[paddedPayload.length - 1] = 2; // delimiter

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, paddedPayload)
  );

  // Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + localPublicKeyRaw.length);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = localPublicKeyRaw.length;
  header.set(localPublicKeyRaw, 21);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header);
  result.set(encrypted, header.length);

  return result;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, salt));

  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoFull = new Uint8Array(info.length + 1);
  infoFull.set(info);
  infoFull[info.length] = 1;

  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoFull));
  return okm.slice(0, length);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const { action, ...body } = await req.json();

    // GET VAPID public key
    if (action === "get-vapid-key") {
      return new Response(
        JSON.stringify({ publicKey: vapidPublicKey ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SUBSCRIBE: save push subscription
    if (action === "subscribe") {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: { user }, error: authErr } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }).auth.getUser();

      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { endpoint, p256dh, auth } = body;
      const { error } = await supabaseAdmin
        .from("push_subscriptions")
        .upsert(
          { user_id: user.id, endpoint, p256dh, auth },
          { onConflict: "user_id,endpoint" }
        );

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NOTIFY: send push to all attendants (called internally)
    if (action === "notify") {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user }, error: userErr } = await anonClient.auth.getUser();
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: roleRows, error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["kitchen", "admin"]);
      if (roleErr || !roleRows || roleRows.length === 0) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!vapidPublicKey || !vapidPrivateKey) {
        return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { title, message, url } = body;

      // Get all attendant/admin user IDs
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["attendant", "admin"]);

      const userIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];

      if (userIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get subscriptions for these users
      const { data: subs } = await supabaseAdmin
        .from("push_subscriptions")
        .select("*")
        .in("user_id", userIds);

      let sent = 0;
      const staleIds: string[] = [];

      for (const sub of subs ?? []) {
        try {
          const pushData = await generatePushPayload(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            JSON.stringify({ title, body: message, url: url ?? "/" }),
            { publicKey: vapidPublicKey, privateKey: vapidPrivateKey }
          );

          const resp = await fetch(pushData.endpoint, {
            method: "POST",
            headers: pushData.headers,
            body: pushData.body,
          });

          if (resp.status === 201 || resp.status === 200) {
            sent++;
          } else if (resp.status === 404 || resp.status === 410) {
            staleIds.push(sub.id);
          } else {
            console.error(`Push failed for ${sub.id}: ${resp.status} ${await resp.text()}`);
          }
        } catch (err) {
          console.error(`Push error for ${sub.id}:`, err);
        }
      }

      // Cleanup stale subscriptions
      if (staleIds.length > 0) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
      }

      return new Response(JSON.stringify({ sent, total: (subs ?? []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Push notify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
