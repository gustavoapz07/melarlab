// Enlaces entre las pantallas de la app (las rutas están en rutas.ts).
import type { MouseEvent, ReactNode } from 'react'
import { RUTAS, type Navegar, type Ruta } from './rutas.ts'

/** Enlace a otra pantalla de la app. Con Ctrl, Cmd o Shift se abre aparte, como cualquier enlace. */
export function Enlace({ a, navegar, actual, className, children }: {
  a: Ruta
  navegar: Navegar
  actual?: boolean
  className?: string
  children: ReactNode
}) {
  const alTocar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navegar(a)
  }
  return <a href={a} onClick={alTocar} className={className} aria-current={actual ? 'page' : undefined}>{children}</a>
}

export function NavModulos({ ruta, navegar }: { ruta: Ruta; navegar: Navegar }) {
  return (
    <nav aria-label="Módulos" className="modulos">
      {RUTAS.map((r) => (
        <Enlace key={r.ruta} a={r.ruta} navegar={navegar} actual={r.ruta === ruta}>{r.nombre}</Enlace>
      ))}
    </nav>
  )
}
