// Piezas de formulario que comparten las pantallas de los módulos.
import { hoyEnElCelular, sumarDiasISO } from './mi-dia/formato.ts'

/** Las opciones de un <select>, a partir de { valor: 'Nombre' }. */
export function Opciones<T extends string>({ opciones }: { opciones: Record<T, string> }) {
  return <>{(Object.entries(opciones) as [T, string][]).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}</>
}

/** Fecha de algo que ya pasó (un gasto, una noche, un entreno), con atajos para hoy y ayer. Vacío quiere decir hoy. */
export function CampoFechaPasada({ id, etiqueta = 'Fecha', valor, cambiar }: {
  id: string
  etiqueta?: string
  valor: string
  cambiar: (v: string) => void
}) {
  const hoy = hoyEnElCelular()
  const ayer = sumarDiasISO(hoy, -1)
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} type="date" value={valor || hoy} max={hoy} onChange={(e) => cambiar(e.target.value === hoy ? '' : e.target.value)} />
      <div className="atajos">
        <button type="button" className="btn btn-q" aria-pressed={!valor || valor === hoy} onClick={() => cambiar('')}>Hoy</button>
        <button type="button" className="btn btn-q" aria-pressed={valor === ayer} onClick={() => cambiar(ayer)}>Ayer</button>
      </div>
    </div>
  )
}
