// Enlaces entre las pantallas de la app (las rutas están en rutas.ts).
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
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

/**
 * La barra de módulos. Si no caben todos, se desplaza de lado: la pantalla actual queda a la vista y
 * un desvanecido en el borde avisa que hay más (data-antes y data-despues, en estilos.css).
 */
export function NavModulos({ ruta, navegar }: { ruta: Ruta; navegar: Navegar }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const actual = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (actual) nav.scrollLeft = actual.offsetLeft - (nav.clientWidth - actual.offsetWidth) / 2
    const marcar = () => {
      nav.dataset.antes = String(nav.scrollLeft > 1)
      nav.dataset.despues = String(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1)
    }
    marcar()
    nav.addEventListener('scroll', marcar, { passive: true })
    window.addEventListener('resize', marcar)
    return () => {
      nav.removeEventListener('scroll', marcar)
      window.removeEventListener('resize', marcar)
    }
  }, [ruta])
  return (
    <nav ref={ref} aria-label="Módulos" className="modulos">
      {RUTAS.map((r) => (
        <Enlace key={r.ruta} a={r.ruta} navegar={navegar} actual={r.ruta === ruta}>{r.nombre}</Enlace>
      ))}
    </nav>
  )
}
