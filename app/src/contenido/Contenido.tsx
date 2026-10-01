// Pantalla Contenido: de una idea a publicaciones. Lo que toca publicar hoy va arriba; después, lo que está
// en producción y las ideas. Un toque avanza cada pieza: de idea a producción, de producción a publicada.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { leerEnlace } from '../enlaces.ts'
import { Opciones } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { cuandoFue, fechaCorta, hoyEnElCelular, sumarDiasISO } from '../mi-dia/formato.ts'
import {
  ETAPAS, FORMATOS, LARGO, REDES, agrupar, formatoYRedes,
  type CambiosPieza, type EstadoContenido, type EtapaContenido, type Formato, type NuevaPieza, type Pieza, type Red,
} from './useContenido.ts'

export interface AccionesContenido {
  estado: EstadoContenido
  agregar: (nueva: NuevaPieza) => Promise<string | null>
  cambiar: (original: Pieza, cambios: CambiosPieza) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

const LISTA_REDES = Object.keys(REDES) as Red[]
const SIN_FORMATO = { '': 'Sin definir', ...FORMATOS }

/** Las redes: un botón por red; tocarlo la agrega o la quita. */
function CampoRedes({ valor, cambiar }: { valor: Red[]; cambiar: (r: Red[]) => void }) {
  return (
    <fieldset className="chips redes">
      <legend>Redes</legend>
      <div className="chips-grid">
        {LISTA_REDES.map((r) => (
          <button key={r} type="button" className="btn chip" aria-pressed={valor.includes(r)}
            onClick={() => cambiar(valor.includes(r) ? valor.filter((x) => x !== r) : LISTA_REDES.filter((x) => x === r || valor.includes(x)))}>
            {REDES[r]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Cuándo sale, con atajos para hoy y mañana. Vacío es sin fecha. */
function CampoFecha({ id, valor, cambiar }: { id: string; valor: string; cambiar: (v: string) => void }) {
  const hoy = hoyEnElCelular()
  return (
    <div className="campo">
      <label htmlFor={id}>Sale el</label>
      <input id={id} type="date" value={valor} onChange={(e) => cambiar(e.target.value)} />
      <div className="atajos">
        <button type="button" className="btn btn-q" aria-pressed={valor === hoy} onClick={() => cambiar(hoy)}>Hoy</button>
        <button type="button" className="btn btn-q" aria-pressed={valor === sumarDiasISO(hoy, 1)} onClick={() => cambiar(sumarDiasISO(hoy, 1))}>Mañana</button>
        {valor && <button type="button" className="btn btn-q" onClick={() => cambiar('')}>Sin fecha</button>}
      </div>
    </div>
  )
}

function Agregar({ acciones, enLinea }: { acciones: AccionesContenido; enLinea: boolean }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [idea, setIdea] = useState('')
  const [formato, setFormato] = useState<Formato | ''>('')
  const [redes, setRedes] = useState<Red[]>([])
  const [fecha, setFecha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = idea.trim()
    if (!texto || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.agregar({ idea: texto, formato: formato || null, redes, estado: 'idea', fecha_publicacion: fecha || null })
    setEnviando(false)
    if (error) {
      setMensaje(error)
      return
    }
    // El formato y las redes se quedan: suele tocar anotar varias ideas para lo mismo.
    setIdea('')
    setFecha('')
    campo.current?.focus()
  }

  const marcas = [formato ? FORMATOS[formato] : null, redes.length ? redes.map((r) => REDES[r]).join(', ') : null,
    fecha ? `sale: ${cuandoFue(fecha).toLowerCase()}` : null].filter(Boolean)

  return (
    <form className="agregar" onSubmit={enviar} aria-label="Anotar una idea">
      <div className="campo">
        <label htmlFor={id}>Idea nueva</label>
        <div className="con-boton">
          <input ref={campo} id={id} value={idea} onChange={(e) => setIdea(e.target.value)} required maxLength={LARGO.idea}
            autoComplete="off" enterKeyHint="done" disabled={!enLinea} />
          <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Anotando…' : 'Anotar'}</button>
        </div>
      </div>
      <details className="mas">
        <summary>Formato, redes y fecha{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <div className="campo">
          <label htmlFor={`${id}-formato`}>Formato</label>
          <select id={`${id}-formato`} value={formato} onChange={(e) => setFormato(e.target.value as Formato | '')}><Opciones opciones={SIN_FORMATO} /></select>
        </div>
        <CampoRedes valor={redes} cambiar={setRedes} />
        <CampoFecha id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
      </details>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </form>
  )
}

function Editor({ p, acciones, cerrar }: { p: Pieza; acciones: AccionesContenido; cerrar: () => void }) {
  const id = useId()
  const [idea, setIdea] = useState(p.idea)
  const [formato, setFormato] = useState<Formato | ''>(p.formato ?? '')
  const [redes, setRedes] = useState<Red[]>(p.redes)
  const [etapa, setEtapa] = useState<EtapaContenido>(p.estado)
  const [fecha, setFecha] = useState(p.fecha_publicacion ?? '')
  const [enlace, setEnlace] = useState(p.enlace ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const texto = idea.trim()
    if (!texto || enviando) return
    const url = leerEnlace(enlace)
    if (url === undefined) {
      setMensaje('El enlace tiene que empezar con https://')
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(p, { idea: texto, formato: formato || null, redes, estado: etapa, fecha_publicacion: fecha || null, enlace: url })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(p.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${p.idea}`}>
      <div className="campo">
        <label htmlFor={`${id}-idea`}>Idea</label>
        {/* El foco va al campo que se acaba de abrir. */}
        <textarea id={`${id}-idea`} value={idea} onChange={(e) => setIdea(e.target.value)} required maxLength={LARGO.idea} rows={2} autoFocus />
      </div>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-formato`}>Formato</label>
          <select id={`${id}-formato`} value={formato} onChange={(e) => setFormato(e.target.value as Formato | '')}><Opciones opciones={SIN_FORMATO} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-etapa`}>Etapa</label>
          <select id={`${id}-etapa`} value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaContenido)}><Opciones opciones={ETAPAS} /></select>
        </div>
      </div>
      <CampoRedes valor={redes} cambiar={setRedes} />
      <CampoFecha id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
      <div className="campo">
        <label htmlFor={`${id}-enlace`}>Enlace de la publicación</label>
        <input id={`${id}-enlace`} type="url" inputMode="url" autoComplete="off" placeholder="https://" value={enlace}
          onChange={(e) => setEnlace(e.target.value)} maxLength={LARGO.enlace} />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar esta idea?</span>
            <button type="button" className="btn" onClick={eliminar} disabled={enviando}>Sí, borrar</button>
            <button type="button" className="btn btn-q" onClick={() => setConfirmar(false)}>No</button>
          </span>
        ) : (
          <button type="button" className="btn btn-q borrar" onClick={() => setConfirmar(true)}>Borrar</button>
        )}
      </div>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </form>
  )
}

type Aviso = { texto: string } | { texto: string; error: true }

function Fila({ p, hoy, enLinea, acciones, avisar }: {
  p: Pieza
  hoy: string
  enLinea: boolean
  acciones: AccionesContenido
  /** El aviso va arriba: al avanzar, la pieza cambia de sección. */
  avisar: (a: Aviso | null) => void
}) {
  const [editando, setEditando] = useState(false)
  if (editando) return <li className="mov editando"><Editor p={p} acciones={acciones} cerrar={() => setEditando(false)} /></li>

  /** Un toque la avanza: de idea a producción; de producción a publicada (con la fecha de hoy si no tenía). */
  async function avanzar() {
    avisar(null)
    const cambios: CambiosPieza = p.estado === 'idea'
      ? { estado: 'en_produccion' }
      : { estado: 'publicado', fecha_publicacion: p.fecha_publicacion && p.fecha_publicacion <= hoy ? p.fecha_publicacion : hoy }
    const error = await acciones.cambiar(p, cambios)
    if (error) avisar({ texto: `${error} ("${p.idea}" quedó como estaba.)`, error: true })
    else avisar({ texto: cambios.estado === 'publicado' ? `Publicada: ${p.idea}. Con Editar le agregas el enlace.` : `En producción: ${p.idea}.` })
  }

  const fecha = p.fecha_publicacion
    ? p.estado === 'publicado' ? `Publicada: ${cuandoFue(p.fecha_publicacion, hoy).toLowerCase()}`
      : `Sale${p.fecha_publicacion < hoy ? ' (atrasada)' : ''}: ${cuandoFue(p.fecha_publicacion, hoy).toLowerCase()}`
    : null
  const meta = [formatoYRedes(p), fecha].filter(Boolean).join(' · ')

  return (
    <li className="mov pieza">
      <div className="mov-cuerpo">
        <p className="mov-t">{p.idea}</p>
        {meta && <p className="meta">{meta}</p>}
        {p.enlace && (
          <p className="enlace-tienda">
            <a href={p.enlace} target="_blank" rel="noopener noreferrer">Ver la publicación<span className="sr"> (se abre aparte)</span></a>
          </p>
        )}
        {p.estado !== 'publicado' && (
          <button type="button" className="btn btn-q contacte" onClick={avanzar} disabled={!enLinea}
            aria-label={`${p.estado === 'idea' ? 'Pasar a producción' : 'Marcar como publicada'}: ${p.idea}`}>
            {p.estado === 'idea' ? 'Pasar a producción' : 'Marcar como publicada'}
          </button>
        )}
      </div>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea} aria-label={`Editar: ${p.idea}`}>Editar</button>
    </li>
  )
}

function Seccion({ id, titulo, lista, children }: { id: string; titulo: string; lista: Pieza[]; children: (p: Pieza) => ReactNode }) {
  if (!lista.length) return null
  return (
    <section id={id} aria-labelledby={`h-${id}`}>
      <h2 className="sec-h" id={`h-${id}`}><span>{titulo}</span><span className="c">{lista.length}</span></h2>
      <ul className="pend-lista">{lista.map(children)}</ul>
    </section>
  )
}

export function PantallaContenido({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesContenido
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const hoy = hoyEnElCelular()
  const [aviso, avisar] = useState<Aviso | null>(null)

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Contenido" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Contenido' : 'No se pudo cargar tu contenido'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus ideas…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu contenido por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const g = agrupar(estado.lista, hoy)
  const titulo = g.tocaHoy.length === 1 ? `Hoy toca publicar: ${g.tocaHoy[0].idea}`
    : g.tocaHoy.length > 1 ? `Hoy toca publicar ${g.tocaHoy.length} piezas`
      : g.ideas.length || g.enProduccion.length
        ? [`${g.ideas.length} ${g.ideas.length === 1 ? 'idea' : 'ideas'}`, g.enProduccion.length ? `${g.enProduccion.length} en producción` : null].filter(Boolean).join(', ')
        : 'Todavía no hay ideas'
  const fila = (p: Pieza) => <Fila key={p.id} p={p} hoy={hoy} enLinea={enLinea} acciones={acciones} avisar={avisar} />

  return (
    <Marco nombre="Contenido" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar tu contenido. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{titulo}</h1>
      <Agregar acciones={acciones} enLinea={enLinea} />
      {aviso && ('error' in aviso ? <p className="alerta" role="alert">{aviso.texto}</p> : <p className="aviso aviso-fuerte" role="status">{aviso.texto}</p>)}
      <Seccion id="toca-publicar" titulo="Toca publicar" lista={g.tocaHoy}>{fila}</Seccion>
      <Seccion id="en-produccion" titulo="En producción" lista={g.enProduccion}>{fila}</Seccion>
      <Seccion id="ideas" titulo="Ideas" lista={g.ideas}>{fila}</Seccion>
      {g.publicadas.length > 0 && (
        <section id="publicadas" aria-labelledby="h-publicadas">
          <h2 className="sec-h" id="h-publicadas"><span>Publicadas</span><span className="c">{g.publicadas.length}</span></h2>
          <details className="mas">
            <summary>Ver lo publicado</summary>
            <ul className="pend-lista">{g.publicadas.map(fila)}</ul>
          </details>
        </section>
      )}
    </Marco>
  )
}
