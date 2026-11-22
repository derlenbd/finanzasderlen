// Modo sin internet de Mis Finanzas
// Si algún día quieres forzar una copia limpia en los celulares, sube este número.
const VERSION = 'finanzas-v1'

const EXTRA = [
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.svg',
]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const nombres = await caches.keys()
      await Promise.all(
        nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

// La página manda la lista de archivos que usa para guardarlos todos
self.addEventListener('message', (e) => {
  if (!e.data || e.data.tipo !== 'guardar') return
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION)
      const base = self.registration.scope
      const lista = new Set([base])
      for (const u of [...EXTRA, ...(e.data.urls || [])]) {
        try {
          lista.add(new URL(u, base).href)
        } catch {
          // dirección rara, se ignora
        }
      }
      for (const u of lista) {
        try {
          if (new URL(u).origin !== self.location.origin) continue
          if (await cache.match(u)) continue
          const res = await fetch(u)
          if (res.ok) await cache.put(u, res)
        } catch {
          // sin internet en este momento, se intenta la próxima vez
        }
      }
    })()
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Al abrir la app: primero internet (versión más nueva); sin internet, la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(VERSION)
        try {
          const res = await fetch(req)
          if (res.ok) await cache.put(self.registration.scope, res.clone())
          return res
        } catch {
          return (
            (await cache.match(self.registration.scope)) ||
            (await cache.match(req)) ||
            Response.error()
          )
        }
      })()
    )
    return
  }

  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION)
      const guardado = await cache.match(req)

      // Archivos con nombre único (carpeta assets): nunca cambian, se sirven directo
      if (guardado && url.pathname.includes('/assets/')) return guardado

      // El resto: copia guardada al instante y se actualiza en segundo plano
      const red = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => null)
      return guardado || (await red) || Response.error()
    })()
  )
})
