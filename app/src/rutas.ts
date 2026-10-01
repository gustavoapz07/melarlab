// Rutas de la app, con direcciones reales (/, /pendientes, /billetera, /descanso, /comidas, /gym y /estudios) para que funcionen el botón de atrás y los
// enlaces. Cloudflare y el service worker devuelven index.html en cualquier dirección, así que también
// abren sin internet. Los enlaces están en navegacion.tsx.
import { useEffect, useRef, useState } from 'react'

export const RUTAS = [
  { ruta: '/', nombre: 'Mi Día' },
  { ruta: '/pendientes', nombre: 'Pendientes' },
  { ruta: '/billetera', nombre: 'Billetera' },
  { ruta: '/descanso', nombre: 'Descanso' },
  { ruta: '/comidas', nombre: 'Comidas' },
  { ruta: '/gym', nombre: 'Gym' },
  { ruta: '/estudios', nombre: 'Estudios' },
] as const

export type Ruta = (typeof RUTAS)[number]['ruta']
export type Navegar = (ruta: Ruta) => void

const leerRuta = (): Ruta => RUTAS.find((r) => r.ruta === window.location.pathname)?.ruta ?? '/'

export function useRuta(): [Ruta, Navegar] {
  const [ruta, setRuta] = useState<Ruta>(leerRuta)
  const cambio = useRef(false)

  useEffect(() => {
    const alVolver = () => {
      cambio.current = true
      setRuta(leerRuta())
    }
    window.addEventListener('popstate', alVolver)
    return () => window.removeEventListener('popstate', alVolver)
  }, [])

  // Después de cambiar de pantalla (no al abrir la app), el foco va al título de la nueva,
  // para que un lector de pantalla anuncie el cambio. Corre cuando la pantalla ya está dibujada.
  useEffect(() => {
    if (!cambio.current) return
    cambio.current = false
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
  }, [ruta])

  const navegar: Navegar = (nueva) => {
    if (nueva === leerRuta()) return
    window.history.pushState(null, '', nueva)
    cambio.current = true
    setRuta(nueva)
    window.scrollTo(0, 0)
  }
  return [ruta, navegar]
}
