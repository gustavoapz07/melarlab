// Marco de las pantallas de la app que no son Mi Día: encabezado, navegación entre módulos y pie con la cuenta.
import type { ReactNode } from 'react'
import { Marca } from './mi-dia/MiDia.tsx'

export function Marco({ nombre, fecha, nav, cuenta, children }: {
  /** Lo que va junto al hexágono, como "Pendientes". */
  nombre: string
  /** Texto corto a la derecha del encabezado, como la fecha. */
  fecha?: string
  nav?: ReactNode
  cuenta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="wrap">
      <header className="mast">
        <span className="brand"><Marca />{nombre}</span>
        {fecha && <span className="date">{fecha}</span>}
      </header>
      {nav}
      <main className="marco">{children}</main>
      {cuenta && (
        <footer className="foot">
          <div className="foot-cuenta">{cuenta}</div>
        </footer>
      )}
    </div>
  )
}
