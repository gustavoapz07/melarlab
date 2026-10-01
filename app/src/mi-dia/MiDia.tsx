// Pantalla Mi Día: la de inicio. Misma estructura y diseño que render() en modulos/mi-dia/render_brief.py.
import { Fragment, type ReactNode } from 'react'
import { Amanecer } from './Amanecer.tsx'
import { horasDelSol, luna } from './cielo.ts'
import { DIAS, MESES, diaSemana, hm, leerFecha, mayuscula, rango, semanaISO, sumarDias, toMin, type Fecha } from './formato.ts'
import type { DatosMiDia, Elemento, Entrega, Evento, Idea, Ubicacion } from './tipos.ts'

// Ubicación de ejemplo si los datos no traen "ubicacion" (la real va en los datos, que no se suben al repositorio).
const UBICACION_EJEMPLO: Ubicacion = { nombre: 'Tegucigalpa', lat: 14.11, lon: -87.2, tz: -6 }

function Flecha() {
  return (
    <svg className="ext" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 1.5h5.5V7M8.5 1.5 1.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** Solo los enlaces https se vuelven enlaces; el resto queda como texto. */
function Titulo({ titulo, url }: { titulo: string; url?: string }) {
  if (url?.startsWith('https://')) {
    return <a className="t" href={url} target="_blank" rel="noopener">{titulo}<Flecha /></a>
  }
  return <span className="t">{titulo}</span>
}

function Meta({ it }: { it: Elemento }) {
  const bits = [it.fuente, it.cuando].filter(Boolean)
  return bits.length ? <p className="meta">{bits.join(' · ')}</p> : null
}

function Items({ lista, extra = true }: { lista: Elemento[]; extra?: boolean }) {
  return (
    <ol className="items">
      {lista.map((it, i) => (
        <li key={i}>
          <span className="n">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <Titulo titulo={it.titulo} url={it.url} />
            {it.texto && <p className="x">{it.texto}</p>}
            {extra && it.para_ti && <p className="note"><span className="k">Para ti</span> {it.para_ti}</p>}
            {extra && it.letra_pequena && <p className="note"><span className="k">Letra pequeña</span> {it.letra_pequena}</p>}
            <Meta it={it} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function FilasAgenda({ eventos }: { eventos: Evento[] }) {
  return (
    <ul className="agenda">
      {eventos.map((ev, i) => {
        const cuando = !ev.inicio ? 'Todo el día' : ev.fin ? rango(ev.inicio, ev.fin) : hm(toMin(ev.inicio))
        return (
          <li key={i}>
            <span className="when">{cuando}</span>
            <span className="what">
              <Titulo titulo={ev.titulo} url={ev.url} />
              {ev.tentativo && <> <span className="tent">por confirmar</span></>}
              {ev.lugar && <span className="where">{ev.lugar}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Agenda({ hoy, manana, fecha }: { hoy: Evento[]; manana: Evento[]; fecha: Fecha }) {
  if (!hoy.length && !manana.length) return <p className="quiet">Sin eventos hoy ni mañana en el calendario.</p>
  const man = sumarDias(fecha, 1)
  return (
    <>
      {hoy.length ? <FilasAgenda eventos={hoy} /> : <p className="quiet">Hoy no hay eventos en el calendario.</p>}
      <h3 className="sub">Mañana, {DIAS[diaSemana(man)]} {man.d}</h3>
      {manana.length ? <FilasAgenda eventos={manana} /> : <p className="quiet">Sin eventos.</p>}
    </>
  )
}

function Entregas({ lista }: { lista: Entrega[] }) {
  return (
    <ul className="agenda">
      {lista.map((it, i) => {
        const f = leerFecha(it.fecha)
        return (
          <li key={i}>
            <span className="when">{mayuscula(DIAS[diaSemana(f)].slice(0, 3))} {f.d} {MESES[f.m - 1].slice(0, 3)}</span>
            <span className="what">
              <Titulo titulo={it.titulo} url={it.url} />
              {it.curso && <span className="where">{it.curso}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function IdeaDeContenido({ idea }: { idea: Idea }) {
  const filas: [string, string | undefined][] = [['Formato', idea.formato], ['Red', idea.red], ['Gancho', idea.gancho],
    ['Desarrollo', idea.desarrollo], ['Cierre', idea.cierre]]
  return (
    <div className="idea">
      <p className="idea-t">{idea.titulo}</p>
      <dl>
        {filas.filter(([, v]) => v).map(([k, v]) => (
          <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>
        ))}
      </dl>
    </div>
  )
}

/** Una línea de un módulo (Salud, Dinero): el nombre del módulo, qué pasa y el enlace a su pantalla. */
export interface Linea { modulo: string; texto: string; enlace: ReactNode }

function Lineas({ lineas }: { lineas: Linea[] }) {
  return (
    <ul className="salud">
      {lineas.map((l) => <li key={l.modulo}><span className="k">{l.modulo}</span>{l.texto} <span className="ver-mas">{l.enlace}</span></li>)}
    </ul>
  )
}

interface Seccion {
  id: string
  etiqueta: string
  titulo: string
  cuenta: number
  contenido: ReactNode
  clase?: string
}

interface Props {
  datos: DatosMiDia
  /** Avisos de la app (sin conexión, otro día, instalar), al inicio del contenido. */
  avisos?: ReactNode
  /** Navegación entre módulos, debajo del encabezado. */
  nav?: ReactNode
  /** Pendientes atrasados y de hoy (del módulo Pendientes, en vivo), con un enlace a la lista completa. */
  pendientes?: { lista: Elemento[]; enlace: ReactNode }
  /** Una línea por módulo de salud (Descanso, y después Gym y Comidas), en vivo, con su enlace. */
  salud?: Linea[]
  /** Una línea por módulo de dinero (Billetera y Lista de deseos), en vivo, con su enlace. */
  dinero?: Linea[]
  /** Una línea por módulo de negocio (Clientes, y después Contenido), en vivo, con su enlace. */
  negocio?: Linea[]
  /** Cuenta y botón de cerrar sesión, en el pie. */
  cuenta?: ReactNode
}

export function MiDia({ datos, avisos, nav, pendientes, salud, dinero, negocio, cuenta }: Props) {
  const fecha = leerFecha(datos.fecha)
  const ubicacion = datos.ubicacion ?? UBICACION_EJEMPLO
  const { salida, puesta } = horasDelSol(fecha, ubicacion.lat, ubicacion.lon, ubicacion.tz)
  const { fase } = luna(fecha)
  const luz = Math.trunc(puesta) - Math.trunc(salida)
  const hoy = datos.eventos_hoy ?? []
  const manana = datos.eventos_manana ?? []
  const atencion = datos.atencion ?? []

  const secciones: Seccion[] = [
    {
      id: 'atencion', etiqueta: 'Atención', titulo: 'Necesita tu atención', cuenta: atencion.length,
      contenido: atencion.length ? <Items lista={atencion} /> : <p className="quiet">Nada urgente esta mañana.</p>,
      clase: atencion.length ? 'attn' : undefined,
    },
    { id: 'agenda', etiqueta: 'Agenda', titulo: 'Agenda', cuenta: hoy.length, contenido: <Agenda hoy={hoy} manana={manana} fecha={fecha} /> },
  ]
  if (pendientes?.lista.length) {
    secciones.splice(1, 0, {
      id: 'pendientes', etiqueta: 'Pendientes', titulo: 'Pendientes de hoy', cuenta: pendientes.lista.length,
      contenido: <><Items lista={pendientes.lista} extra={false} /><p className="ver-mas">{pendientes.enlace}</p></>,
    })
  }
  if (salud?.length) {
    secciones.push({
      id: 'salud', etiqueta: 'Salud', titulo: 'Salud', cuenta: salud.length,
      contenido: <Lineas lineas={salud} />,
    })
  }
  if (datos.entregas?.length) {
    secciones.push({ id: 'entregas', etiqueta: 'Entregas', titulo: 'Entregas de la U · próximos 7 días', cuenta: datos.entregas.length, contenido: <Entregas lista={datos.entregas} /> })
  }
  if (dinero?.length) {
    secciones.push({ id: 'dinero', etiqueta: 'Dinero', titulo: 'Dinero', cuenta: dinero.length, contenido: <Lineas lineas={dinero} /> })
  }
  if (negocio?.length) {
    secciones.push({ id: 'negocio', etiqueta: 'Negocio', titulo: 'Negocio', cuenta: negocio.length, contenido: <Lineas lineas={negocio} /> })
  }
  if (datos.resuelto?.length) {
    secciones.push({ id: 'resuelto', etiqueta: 'Resuelto', titulo: 'Resuelto', cuenta: datos.resuelto.length, contenido: <Items lista={datos.resuelto} extra={false} /> })
  }
  if (datos.ia?.length) {
    secciones.push({ id: 'ia', etiqueta: 'IA', titulo: 'Novedades de IA', cuenta: datos.ia.length, contenido: <Items lista={datos.ia} /> })
  }
  if (datos.idea) {
    secciones.push({ id: 'idea', etiqueta: 'Idea', titulo: 'Idea de contenido', cuenta: 1, contenido: <IdeaDeContenido idea={datos.idea} /> })
  }
  for (const extra of datos.secciones_extra ?? []) {
    const items = extra.items ?? []
    secciones.push({ id: `x${secciones.length}`, etiqueta: extra.titulo.slice(0, 10), titulo: extra.titulo, cuenta: items.length, contenido: <Items lista={items} /> })
  }

  const dia = DIAS[diaSemana(fecha)]
  const mes = MESES[fecha.m - 1]
  const fechaLarga = `${mayuscula(dia)} ${fecha.d} de ${mes} de ${fecha.y}`
  const fechaCorta = `${mayuscula(dia.slice(0, 3))} ${fecha.d} ${mes.slice(0, 3)}`
  const alt = `Amanecer en ${ubicacion.nombre}: el sol sale a las ${hm(salida)} y se pone a las ${hm(puesta)}. `
    + (hoy.length ? `${hoy.length} eventos hoy en la línea del día.` : 'Sin eventos hoy en la línea del día.')

  return (
    <div className="wrap">
      <header className="mast">
        <span className="brand"><Marca />Mi Día</span>
        <span className="date">
          <span className="d-long">{fechaLarga} · </span>
          <span className="d-short">{fechaCorta} · </span>Sem {semanaISO(fecha)}
        </span>
      </header>
      {nav}
      <main>
        {avisos}
        <h1 tabIndex={-1}>{datos.titular}</h1>
        <figure>
          <div role="img" aria-label={alt}>
            <Amanecer fecha={fecha} ubicacion={ubicacion} eventos={hoy} variante="wide" />
            <Amanecer fecha={fecha} ubicacion={ubicacion} eventos={hoy} variante="narrow" />
          </div>
          <dl className="cap">
            <div><dt>Sale el sol</dt><dd>{hm(salida)}</dd></div>
            <div><dt>Se pone</dt><dd>{hm(puesta)}</dd></div>
            <div><dt>Luz</dt><dd>{Math.floor(luz / 60)} h {luz % 60} min</dd></div>
            <div><dt>Luna</dt><dd>{fase}</dd></div>
          </dl>
        </figure>
        <nav aria-label="Secciones">
          <ol className="idx">
            {secciones.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}><b>{s.cuenta}</b><span>{s.etiqueta}</span></a></li>
            ))}
          </ol>
        </nav>
        {secciones.map((s, i) => (
          <section key={s.id} id={s.id} className={s.clase} aria-labelledby={`h-${s.id}`}>
            <h2 className="sec-h" id={`h-${s.id}`}>
              <span className="i">{String(i + 1).padStart(2, '0')}</span>
              <span>{s.titulo}</span>
              <span className="c">{s.cuenta}</span>
            </h2>
            {s.contenido}
          </section>
        ))}
      </main>
      <footer className="foot">
        <span>{[ubicacion.nombre, ...(datos.fuentes ?? [])].join(' · ')}</span>
        <span>{datos.generado ? `Generado ${datos.generado}` : ''}</span>
        {cuenta && <div className="foot-cuenta">{cuenta}</div>}
      </footer>
    </div>
  )
}

/** El hexágono de MelarLab: la celda y la miel guardada adentro. */
export function Marca() {
  return (
    <svg className="marca" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.2 20.5 7.1v9.8L12 21.8 3.5 16.9V7.1Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="miter" />
      <path d="M12 7.9 15.6 10v4L12 16.1 8.4 14v-4Z" fill="currentColor" />
    </svg>
  )
}
