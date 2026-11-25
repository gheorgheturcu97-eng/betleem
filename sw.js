// Reverb online: 🔔 shows the notification "Ai fost programat" and opens the program when tapped. Nothing is cached here
// (the page always comes fresh from the internet).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Reverb', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Reverb', { body: d.body || '', tag: d.tag, icon: 'icon-512.png', badge: 'icon-512.png', data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope)); if (c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
