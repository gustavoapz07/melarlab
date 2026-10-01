// Pantalla Radar: el Radar semanal de IA que publica la rutina de los domingos. Las novedades con su letra
// pequeña y cómo aplicarlas, una herramienta para probar, una idea de servicio y los radares anteriores.
// Todo es texto: nada de lo que llega se interpreta como HTML, y los enlaces (solo https) se abren aparte.
import { useState, type ReactNode } from 'react'
import { Marco } from '../Marco.tsx'
import { fechaCorta, fechaEnPalabras, hoyEnElCelular, mayuscula, sumarDiasISO } from '../mi-dia/formato.ts'
import type { EstadoTabla } from '../useTabla.ts'
import type { Novedad, Radar } from './radar.ts'

/** Un enlace a la fuente: se abre aparte y sin pasarle nada de la app. */
function Fuente({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}<span className="sr"> (se abre aparte)</span></a>
}

function Novedades({ lista }: { lista: Novedad[] }) {
  return (
    <ol className="items">
      {lista.map((n, i) => (
        <li key={`${i}-${n.titulo}`}>
          <span className="n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <div>
            {n.enlace ? <Fuente href={n.enlace} className="t">{n.titulo}</Fuente> : <p className="t">{n.titulo}</p>}
            {n.texto && <p className="x">{n.texto}</p>}
            {n.aplicacion && <p className="note"><span className="k">Para ti</span>{n.aplicacion}</p>}
            {n.letra_pequena && <p className="note"><span className="k">Letra pequeña</span>{n.letra_pequena}</p>}
            {(n.gratis || n.fuente) && <p className="meta">{[n.gratis, n.fuente].filter(Boolean).join(' · ')}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function PantallaRadar({ estado, recargar, enLinea, nav, cuenta, avisos }: {
  estado: EstadoTabla<Radar>
  recargar: () => void
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const hoy = hoyEnElCelular()
  const [elegida, setElegida] = useState<string | null>(null)

  if (estado.tipo !== 'listo' || !estado.lista.length) {
    const vacio = estado.tipo === 'listo'
    const titulo = estado.tipo === 'cargando' ? 'Radar' : vacio ? 'Tu primer Radar llega el domingo' : 'No se pudo cargar el Radar'
    const bajada = estado.tipo === 'cargando' ? 'Cargando el Radar…'
      : vacio ? 'Cada domingo a las 6:45 PM: lo más útil de la semana en IA, verificado en su fuente, con una herramienta para probar y una idea de servicio.'
        : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver el Radar por primera vez hace falta internet.'
    return (
      <Marco nombre="Radar" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{titulo}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>{bajada}</p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const radar = estado.lista.find((r) => r.fecha === elegida) ?? estado.lista[0]
  const d = radar.datos
  const esElUltimo = radar.fecha === estado.lista[0].fecha
  const viejo = esElUltimo && radar.fecha < sumarDiasISO(hoy, -7)
  const anteriores = estado.lista.filter((r) => r.fecha !== radar.fecha)

  return (
    <Marco nombre="Radar" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar el Radar. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={recargar}>Reintentar</button></span>
        </p>
      )}
      {!esElUltimo && (
        <p className="aviso">
          Es el Radar del {fechaEnPalabras(radar.fecha)}.
          <span className="acc"><button type="button" className="btn btn-q" onClick={() => setElegida(null)}>Ver el último</button></span>
        </p>
      )}
      {viejo && <p className="aviso">Es el Radar del {fechaEnPalabras(radar.fecha)}. Uno nuevo llega los domingos a las 6:45 PM.</p>}
      <h1 tabIndex={-1}>{d.titular ?? `Radar del ${fechaEnPalabras(radar.fecha)}`}</h1>
      <p className="bajada">{d.resumen ?? `${mayuscula(fechaEnPalabras(radar.fecha))}: ${d.novedades.length} novedades de la semana.`}</p>

      <section id="novedades" aria-labelledby="h-novedades">
        <h2 className="sec-h" id="h-novedades"><span>Novedades de la semana</span><span className="c">{d.novedades.length}</span></h2>
        <Novedades lista={d.novedades} />
      </section>

      {d.probar && (
        <section id="probar" aria-labelledby="h-probar">
          <h2 className="sec-h" id="h-probar"><span>Para probar esta semana</span></h2>
          <div className="idea">
            <p className="idea-t">{d.probar.enlace ? <Fuente href={d.probar.enlace}>{d.probar.titulo}</Fuente> : d.probar.titulo}</p>
            {d.probar.texto && <p className="x">{d.probar.texto}</p>}
            {d.probar.pasos && d.probar.pasos.length > 0 && <ol className="pasos">{d.probar.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>}
          </div>
        </section>
      )}

      {d.idea_servicio && (
        <section id="servicio" aria-labelledby="h-servicio">
          <h2 className="sec-h" id="h-servicio"><span>Idea de servicio</span></h2>
          <div className="idea">
            <p className="idea-t">{d.idea_servicio.titulo}</p>
            {d.idea_servicio.texto && <p className="x">{d.idea_servicio.texto}</p>}
          </div>
        </section>
      )}

      {anteriores.length > 0 && (
        <section id="anteriores" aria-labelledby="h-anteriores">
          <h2 className="sec-h" id="h-anteriores"><span>Radares anteriores</span><span className="c">{anteriores.length}</span></h2>
          <ul className="anteriores">
            {anteriores.map((r) => (
              <li key={r.fecha}>
                <button type="button" className="btn btn-q" onClick={() => { setElegida(r.fecha); window.scrollTo({ top: 0 }) }}>
                  {mayuscula(fechaEnPalabras(r.fecha))}
                </button>
                {r.datos.titular && <span className="meta">{r.datos.titular}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.fuentes && d.fuentes.length > 0 && <p className="meta fuentes-radar">{['Fuentes', ...d.fuentes].join(' · ')}{d.generado ? ` · Generado ${d.generado}` : ''}</p>}
    </Marco>
  )
}
