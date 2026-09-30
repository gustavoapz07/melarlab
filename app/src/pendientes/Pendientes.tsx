// Pantalla Pendientes: agregar en segundos, marcar como hecho, editar y borrar.
// Agrupados por fecha límite: atrasados, hoy, próximos y sin fecha, más los hechos de las últimas dos semanas.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Marco } from '../Marco.tsx'
import { DIAS, MESES, diaSemana, hoyEnElCelular, leerFecha, mayuscula, sumarDiasISO } from '../mi-dia/formato.ts'
import {
  AREAS, ESTADOS, LARGO, PRIORIDADES, agrupar, cuandoVence,
  type Area, type CambiosPendiente, type EstadoLista, type EstadoPendiente, type NuevoPendiente, type Pendiente, type Prioridad,
} from './usePendientes.ts'

export interface AccionesPendientes {
  estado: EstadoLista
  agregar: (nuevo: NuevoPendiente) => Promise<string | null>
  cambiar: (original: Pendiente, cambios: CambiosPendiente) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

function resumen(porHacer: number, atrasados: number): string {
  if (porHacer === 0) return 'Nada pendiente.'
  const base = `${porHacer} por hacer`
  if (!atrasados) return base
  return `${base}, ${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}`
}

function Opciones<T extends string>({ opciones }: { opciones: Record<T, string> }) {
  return <>{(Object.entries(opciones) as [T, string][]).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}</>
}

/** Fecha límite con atajos para hoy y mañana. */
function CampoFecha({ id, valor, cambiar }: { id: string; valor: string; cambiar: (v: string) => void }) {
  const hoy = hoyEnElCelular()
  const manana = sumarDiasISO(hoy, 1)
  return (
    <div className="campo">
      <label htmlFor={id}>Para cuándo</label>
      <input id={id} type="date" value={valor} onChange={(e) => cambiar(e.target.value)} />
      <div className="atajos">
        <button type="button" className="btn btn-q" aria-pressed={valor === hoy} onClick={() => cambiar(hoy)}>Hoy</button>
        <button type="button" className="btn btn-q" aria-pressed={valor === manana} onClick={() => cambiar(manana)}>Mañana</button>
        {valor && <button type="button" className="btn btn-q" onClick={() => cambiar('')}>Sin fecha</button>}
      </div>
    </div>
  )
}

function Agregar({ agregar, enLinea }: { agregar: AccionesPendientes['agregar']; enLinea: boolean }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [tarea, setTarea] = useState('')
  const [fecha, setFecha] = useState('')
  const [area, setArea] = useState<Area>('personal')
  const [prioridad, setPrioridad] = useState<Prioridad>('media')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const limpia = tarea.trim()
    if (!limpia || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await agregar({ tarea: limpia, fecha_limite: fecha || null, area, prioridad })
    setEnviando(false)
    if (error) {
      setMensaje(error)
      return
    }
    // El área se queda: suele tocar agregar varios de lo mismo seguidos.
    setTarea('')
    setFecha('')
    setPrioridad('media')
    campo.current?.focus()
  }

  return (
    <form className="agregar" onSubmit={enviar} aria-label="Agregar un pendiente">
      <div className="campo">
        <label htmlFor={id}>Nuevo pendiente</label>
        <div className="con-boton">
          <input ref={campo} id={id} value={tarea} onChange={(e) => setTarea(e.target.value)} required maxLength={LARGO.tarea}
            autoComplete="off" enterKeyHint="done" disabled={!enLinea} />
          <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Agregando…' : 'Agregar'}</button>
        </div>
      </div>
      <details className="mas">
        <summary>Fecha, área y prioridad</summary>
        <div className="fila">
          <CampoFecha id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
          <div className="campo">
            <label htmlFor={`${id}-area`}>Área</label>
            <select id={`${id}-area`} value={area} onChange={(e) => setArea(e.target.value as Area)}><Opciones opciones={AREAS} /></select>
          </div>
          <div className="campo">
            <label htmlFor={`${id}-prioridad`}>Prioridad</label>
            <select id={`${id}-prioridad`} value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}><Opciones opciones={PRIORIDADES} /></select>
          </div>
        </div>
      </details>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </form>
  )
}

function Editor({ p, acciones, cerrar }: { p: Pendiente; acciones: AccionesPendientes; cerrar: () => void }) {
  const id = useId()
  const [tarea, setTarea] = useState(p.tarea)
  const [fecha, setFecha] = useState(p.fecha_limite ?? '')
  const [area, setArea] = useState<Area>(p.area)
  const [prioridad, setPrioridad] = useState<Prioridad>(p.prioridad)
  const [estado, setEstado] = useState<EstadoPendiente>(p.estado)
  const [notas, setNotas] = useState(p.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const limpia = tarea.trim()
    if (!limpia || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(p, { tarea: limpia, fecha_limite: fecha || null, area, prioridad, estado, notas: notas.trim() || null })
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
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${p.tarea}`}>
      <div className="campo">
        <label htmlFor={`${id}-tarea`}>Pendiente</label>
        {/* El foco va al campo que se acaba de abrir. */}
        <input id={`${id}-tarea`} value={tarea} onChange={(e) => setTarea(e.target.value)} required maxLength={LARGO.tarea} autoComplete="off" autoFocus />
      </div>
      <div className="fila">
        <CampoFecha id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
        <div className="campo">
          <label htmlFor={`${id}-area`}>Área</label>
          <select id={`${id}-area`} value={area} onChange={(e) => setArea(e.target.value as Area)}><Opciones opciones={AREAS} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-prioridad`}>Prioridad</label>
          <select id={`${id}-prioridad`} value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}><Opciones opciones={PRIORIDADES} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-estado`}>Estado</label>
          <select id={`${id}-estado`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoPendiente)}><Opciones opciones={ESTADOS} /></select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-notas`}>Notas</label>
        <textarea id={`${id}-notas`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={LARGO.notas} rows={3} />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar este pendiente?</span>
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

function Fila({ p, hoy, enLinea, acciones, avisar }: {
  p: Pendiente
  hoy: string
  enLinea: boolean
  acciones: AccionesPendientes
  /** Muestra un error arriba de la lista: al marcar como hecho, la fila cambia de grupo y un mensaje suyo se perdería. */
  avisar: (mensaje: string | null) => void
}) {
  const id = useId()
  const [editando, setEditando] = useState(false)
  const hecho = p.estado === 'hecho'

  if (editando) {
    return <li className="pend editando"><Editor p={p} acciones={acciones} cerrar={() => setEditando(false)} /></li>
  }

  async function alternar() {
    avisar(null)
    const error = await acciones.cambiar(p, { estado: hecho ? 'pendiente' : 'hecho' })
    if (error) avisar(`${error} ("${p.tarea}" quedó como estaba.)`)
  }

  const meta = [
    cuandoVence(p, hoy),
    AREAS[p.area],
    p.prioridad === 'alta' ? 'Prioridad alta' : undefined,
    p.estado === 'en_curso' ? 'En curso' : undefined,
  ].filter(Boolean)

  return (
    <li className={hecho ? 'pend hecho' : 'pend'}>
      <input type="checkbox" id={id} checked={hecho} onChange={alternar} disabled={!enLinea}
        aria-describedby={meta.length ? `${id}-meta` : undefined} />
      <div className="pend-cuerpo">
        <label htmlFor={id} className="pend-t">{p.tarea}</label>
        {p.notas && <p className="x">{p.notas}</p>}
        {meta.length > 0 && <p className="meta" id={`${id}-meta`}>{meta.join(' · ')}</p>}
      </div>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea} aria-label={`Editar: ${p.tarea}`}>
        Editar
      </button>
    </li>
  )
}

function Grupo({ id, titulo, lista, children }: { id: string; titulo: string; lista: Pendiente[]; children: (p: Pendiente) => ReactNode }) {
  if (!lista.length) return null
  return (
    <section id={id} aria-labelledby={`h-${id}`}>
      <h2 className="sec-h" id={`h-${id}`}><span>{titulo}</span><span className="c">{lista.length}</span></h2>
      <ul className="pend-lista">{lista.map(children)}</ul>
    </section>
  )
}

export function PantallaPendientes({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesPendientes
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const [mensaje, avisar] = useState<string | null>(null)
  const hoy = hoyEnElCelular()
  const f = leerFecha(hoy)
  const fechaCorta = `${mayuscula(DIAS[diaSemana(f)].slice(0, 3))} ${f.d} ${MESES[f.m - 1].slice(0, 3)}`
  const fila = (p: Pendiente) => <Fila key={p.id} p={p} hoy={hoy} enLinea={enLinea} acciones={acciones} avisar={avisar} />

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Pendientes" fecha={fechaCorta} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Pendientes' : 'No se pudieron cargar tus pendientes'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus pendientes…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tus pendientes por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const g = agrupar(estado.lista, hoy)
  const porHacer = g.atrasados.length + g.hoy.length + g.proximos.length + g.sinFecha.length

  return (
    <Marco nombre="Pendientes" fecha={fechaCorta} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar la lista. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{resumen(porHacer, g.atrasados.length)}</h1>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
      <Agregar agregar={acciones.agregar} enLinea={enLinea} />
      <Grupo id="atrasados" titulo="Atrasados" lista={g.atrasados}>{fila}</Grupo>
      <Grupo id="hoy" titulo="Hoy" lista={g.hoy}>{fila}</Grupo>
      <Grupo id="proximos" titulo="Próximos" lista={g.proximos}>{fila}</Grupo>
      <Grupo id="sin-fecha" titulo="Sin fecha" lista={g.sinFecha}>{fila}</Grupo>
      {g.hechos.length > 0 && (
        <section id="hechos" aria-labelledby="h-hechos">
          <h2 className="sec-h" id="h-hechos"><span>Hechos · últimas dos semanas</span><span className="c">{g.hechos.length}</span></h2>
          <details className="mas">
            <summary>Ver los hechos</summary>
            <ul className="pend-lista">{g.hechos.map(fila)}</ul>
          </details>
        </section>
      )}
    </Marco>
  )
}
