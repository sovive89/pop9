import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_KEY_CACHE = { key: "" };

async function getVapidPublicKey(): Promise<string | null> {
  if (VAPID_KEY_CACHE.key) return VAPID_KEY_CACHE.key;

  try {
    const { data, error } = await supabase.functions.invoke("push-notify", {
      body: { action: "get-vapid-key" },
    });
    if (error || !data?.publicKey) return null;
    VAPID_KEY_CACHE.key = data.publicKey;
    return data.publicKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.warn("VAPID public key not configured");
      return false;
    }

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
    }

    const key = subscription.getKey("p256dh");
    const auth = subscription.getKey("auth");

    if (!key || !auth) return false;

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const authStr = btoa(String.fromCharCode(...new Uint8Array(auth)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const { error } = await supabase.functions.invoke("push-notify", {
      body: {
        action: "subscribe",
        endpoint: subscription.endpoint,
        p256dh,
        auth: authStr,
      },
    });

    if (error) {
      console.error("Failed to save push subscription:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Push subscription error:", err);
    return false;
  }
}

export function usePushNotifications(userId: string | undefined) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!userId || subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const setup = async () => {
      try {
        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready;
        const success = await subscribeToPush(registration);
        if (success) {
          subscribedRef.current = true;
          console.log("Push notifications enabled");
        }
      } catch (err) {
        console.error("Push setup error:", err);
      }
    };

    // Small delay to not block initial render
    const timer = setTimeout(setup, 3000);
    return () => clearTimeout(timer);
  }, [userId]);
}
