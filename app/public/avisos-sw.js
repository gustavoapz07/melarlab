// Avisos de MelarLab (web push): el service worker los recibe y los muestra aunque la app esté cerrada.
// Lo carga el service worker que genera vite-plugin-pwa (workbox.importScripts en vite.config.ts).
// El aviso llega cifrado desde la función avisos de Supabase y trae { titulo, texto, url, etiqueta }.
// Se muestra siempre algo: iPhone y Chrome piden que cada push se vea (userVisibleOnly).

self.addEventListener('push', (evento) => {
  let aviso = {}
  try {
    aviso = evento.data ? evento.data.json() : {}
  } catch {
    aviso = {}
  }
  const texto = (v, largo) => (typeof v === 'string' ? v.trim().slice(0, largo) : '')
  // Solo direcciones de la propia app: un aviso no puede abrir otro sitio.
  const url = typeof aviso.url === 'string' && aviso.url.startsWith('/') && !aviso.url.startsWith('//') ? aviso.url : '/'
  evento.waitUntil(self.registration.showNotification(texto(aviso.titulo, 80) || 'MelarLab', {
    body: texto(aviso.texto, 300),
    icon: '/pwa-192x192.png',
    badge: '/badge-96x96.png',
    lang: 'es',
    // Uno solo por etiqueta: el aviso de hoy reemplaza al de ayer si sigue en la bandeja.
    tag: texto(aviso.etiqueta, 40) || 'melarlab',
    data: { url },
  }))
})

// Tocar el aviso abre la app (o la trae al frente, si ya estaba abierta) en la pantalla del aviso.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin)
    if (abierta) {
      await abierta.focus()
      if (abierta.url !== destino && 'navigate' in abierta) await abierta.navigate(destino).catch(() => {})
      return
    }
    await self.clients.openWindow(destino)
  })())
})
