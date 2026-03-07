// Custom service worker for push notifications
// This is imported by the VitePWA-generated service worker

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TableMate", body: event.data.text() };
  }

  const options = {
    body: data.body || "Novo aviso",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    vibrate: [200, 100, 200, 100, 200],
    tag: "tablemate-order",
    renotify: true,
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "Abrir" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "TableMate", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return clients.openWindow(url);
    })
  );
});
