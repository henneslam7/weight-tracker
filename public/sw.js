// 食咗飯未 service worker：只負責 Web Push，唔做 cache。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "食咗飯未", {
      body: data.body || "",
      icon: "/icon-192.png?v=3", // 版本號要同 lib/brand.ts 嘅 ASSET_V 一致（scripts/test-brand.ts 會檢查）
      badge: "/icon-192.png?v=3",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) {
            try {
              await c.navigate(target);
            } catch {
              /* 忽略 */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
