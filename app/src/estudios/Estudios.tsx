// Pantalla Estudios: el plan de estudios con el estado de cada materia y el avance de la carrera.
// La primera vez carga el plan de UNITEC con un botón; después se marca lo aprobado, materia por materia
// o todo un período de una vez (con Deshacer). Las electivas se editan al elegirlas.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Marco } from '../Marco.tsx'
import { fechaCorta, hoyEnElCelular } from '../mi-dia/formato.ts'
import { MATERIAS_DEL_PLAN, PLAN } from './plan-unitec.ts'
import {
  ESTADOS, LARGO, RANGO, calcularAvance, porPeriodo, romano,
  type Avance, type CambiosMateria, type EstadoEstudios, type EstadoMateria, type Materia, type NuevaMateria, type Periodo,
} from './useEstudios.ts'

export interface AccionesEstudios {
  estado: EstadoEstudios
  agregar: (nuevas: NuevaMateria[]) => Promise<string | null>
  cambiar: (original: Materia, cambios: CambiosMateria) => Promise<string | null>
  cambiarVarias: (materias: Materia[], nuevo: EstadoMateria) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

const creditos = (n: number) => `${n} ${n === 1 ? 'crédito' : 'créditos'}`
const materias = (n: number) => `${n} ${n === 1 ? 'materia' : 'materias'}`
const PERIODOS = Array.from({ length: RANGO.periodo[1] }, (_, i) => i + 1)

function Opciones<T extends string>({ opciones }: { opciones: Record<T, string> }) {
  return <>{(Object.entries(opciones) as [T, string][]).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}</>
}

function CampoPeriodo({ id, valor, cambiar }: { id: string; valor: number; cambiar: (n: number) => void }) {
  return (
    <div className="campo">
      <label htmlFor={id}>Período</label>
      <select id={id} value={valor} onChange={(e) => cambiar(Number(e.target.value))}>
        {PERIODOS.map((n) => <option key={n} value={n}>{romano(n)}</option>)}
      </select>
    </div>
  )
}

function CampoCreditos({ id, valor, cambiar }: { id: string; valor: string; cambiar: (v: string) => void }) {
  return (
    <div className="campo">
      <label htmlFor={id}>Créditos</label>
      <input id={id} type="number" inputMode="numeric" min={RANGO.creditos[0]} max={RANGO.creditos[1]} step={1} required
        value={valor} onChange={(e) => cambiar(e.target.value)} />
    </div>
  )
}

/** Barra de créditos (aprobados y cursando) y los números de la carrera. La barra es decorativa: los números van en texto. */
function AvanceCarrera({ a }: { a: Avance }) {
  const ancho = (n: number) => (a.total ? (n / a.total) * 100 : 0)
  return (
    <div className="avance">
      {/* SVG y no estilos en línea: la política de contenido de la app no los permite. */}
      <svg className="barra" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect className="barra-fondo" width="100" height="4" />
        <rect className="f1" width={ancho(a.aprobados)} height="4" />
        <rect className="barra-c" x={ancho(a.aprobados)} width={ancho(a.cursando)} height="4" />
      </svg>
      <dl className="cap">
        <div><dt><span className="clave" aria-hidden="true" />Aprobado</dt><dd>{`${a.porcentaje}\u00a0%`}</dd></div>
        <div><dt><span className="clave clave-c" aria-hidden="true" />Cursando</dt><dd>{materias(a.materiasCursando)}</dd></div>
        <div><dt>Faltan</dt><dd>{creditos(a.total - a.aprobados)}</dd></div>
        <div><dt>Promedio</dt><dd>{a.promedio ?? 'Sin notas'}</dd></div>
      </dl>
      <p className="ayuda">La casilla marca una materia como aprobada.</p>
    </div>
  )
}

function AgregarMateria({ agregar, enLinea, periodoInicial }: { agregar: AccionesEstudios['agregar']; enLinea: boolean; periodoInicial: number }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [asignatura, setAsignatura] = useState('')
  const [codigo, setCodigo] = useState('')
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [creditosTxt, setCreditos] = useState('4')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const a = asignatura.trim()
    const c = codigo.trim()
    if (!a || !c || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await agregar([{ periodo, codigo: c, asignatura: a, creditos: Number(creditosTxt), notas: null }])
    setEnviando(false)
    if (error) {
      setMensaje(error)
      return
    }
    // El período y los créditos se quedan: suele tocar agregar varias del mismo período.
    setAsignatura('')
    setCodigo('')
    campo.current?.focus()
  }

  return (
    <details className="mas otra-materia">
      <summary>Agregar una materia</summary>
      <form className="editor" onSubmit={enviar} aria-label="Agregar una materia">
        <div className="campo">
          <label htmlFor={`${id}-asignatura`}>Asignatura</label>
          <input ref={campo} id={`${id}-asignatura`} value={asignatura} onChange={(e) => setAsignatura(e.target.value)} required
            maxLength={LARGO.asignatura} autoComplete="off" disabled={!enLinea} />
        </div>
        <div className="fila">
          <div className="campo">
            <label htmlFor={`${id}-codigo`}>Código</label>
            <input id={`${id}-codigo`} value={codigo} onChange={(e) => setCodigo(e.target.value)} required maxLength={LARGO.codigo}
              autoComplete="off" autoCapitalize="characters" disabled={!enLinea} />
          </div>
          <CampoPeriodo id={`${id}-periodo`} valor={periodo} cambiar={setPeriodo} />
          <CampoCreditos id={`${id}-creditos`} valor={creditosTxt} cambiar={setCreditos} />
        </div>
        <div className="acciones">
          <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Agregando…' : 'Agregar'}</button>
        </div>
        {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
      </form>
    </details>
  )
}

function EditorMateria({ m, acciones, cerrar }: { m: Materia; acciones: AccionesEstudios; cerrar: () => void }) {
  const id = useId()
  const [asignatura, setAsignatura] = useState(m.asignatura)
  const [codigo, setCodigo] = useState(m.codigo)
  const [periodo, setPeriodo] = useState(m.periodo)
  const [creditosTxt, setCreditos] = useState(String(m.creditos))
  const [estado, setEstado] = useState<EstadoMateria>(m.estado)
  const [notaTxt, setNota] = useState(m.nota_final === null ? '' : String(m.nota_final))
  const [notas, setNotas] = useState(m.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const a = asignatura.trim()
    const c = codigo.trim()
    if (!a || !c || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(m, {
      asignatura: a, codigo: c, periodo, creditos: Number(creditosTxt), estado,
      nota_final: notaTxt === '' ? null : Number(notaTxt), notas: notas.trim() || null,
    })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(m.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${m.asignatura}`}>
      <div className="campo">
        <label htmlFor={`${id}-asignatura`}>Asignatura</label>
        {/* El foco va al campo que se acaba de abrir. */}
        <input id={`${id}-asignatura`} value={asignatura} onChange={(e) => setAsignatura(e.target.value)} required
          maxLength={LARGO.asignatura} autoComplete="off" autoFocus />
      </div>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-codigo`}>Código</label>
          <input id={`${id}-codigo`} value={codigo} onChange={(e) => setCodigo(e.target.value)} required maxLength={LARGO.codigo}
            autoComplete="off" autoCapitalize="characters" />
        </div>
        <CampoPeriodo id={`${id}-periodo`} valor={periodo} cambiar={setPeriodo} />
        <CampoCreditos id={`${id}-creditos`} valor={creditosTxt} cambiar={setCreditos} />
        <div className="campo">
          <label htmlFor={`${id}-estado`}>Estado</label>
          <select id={`${id}-estado`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoMateria)}><Opciones opciones={ESTADOS} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-nota`}>Nota final</label>
          <input id={`${id}-nota`} type="number" inputMode="decimal" min={RANGO.nota[0]} max={RANGO.nota[1]} step={0.01}
            value={notaTxt} onChange={(e) => setNota(e.target.value)} />
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
            <span>¿Borrar esta materia?</span>
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

function FilaMateria({ m, enLinea, acciones }: { m: Materia; enLinea: boolean; acciones: AccionesEstudios }) {
  const id = useId()
  const [editando, setEditando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const aprobada = m.estado === 'aprobada'

  if (editando) {
    return <li className="pend mat editando"><EditorMateria m={m} acciones={acciones} cerrar={() => setEditando(false)} /></li>
  }

  async function alternar() {
    setMensaje(null)
    const error = await acciones.cambiar(m, { estado: aprobada ? 'pendiente' : 'aprobada' })
    if (error) setMensaje(`${error} ("${m.asignatura}" quedó como estaba.)`)
  }

  const datos = [m.codigo, creditos(m.creditos), m.nota_final !== null ? `Nota ${m.nota_final}` : null].filter(Boolean).join(' · ')

  return (
    <li className={`pend mat ${m.estado}`}>
      <input type="checkbox" id={id} checked={aprobada} onChange={alternar} disabled={!enLinea} aria-describedby={`${id}-meta`} />
      <div className="pend-cuerpo">
        <label htmlFor={id} className="pend-t">{m.asignatura}</label>
        <p className="meta" id={`${id}-meta`}>
          {aprobada && <span className="sr">Aprobada. </span>}
          {m.estado === 'cursando' && <><b>Cursando</b> · </>}
          {datos}
        </p>
        {m.notas && <p className="x">{m.notas}</p>}
      </div>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea} aria-label={`Editar: ${m.asignatura}`}>
        Editar
      </button>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </li>
  )
}

type AvisoPeriodo =
  | { tipo: 'hecho'; texto: string; antes: Materia[]; nuevo: EstadoMateria }
  | { tipo: 'error'; texto: string }

function SeccionPeriodo({ p, enLinea, acciones }: { p: Periodo; enLinea: boolean; acciones: AccionesEstudios }) {
  const r = romano(p.numero)
  // Los períodos ya aprobados al abrir la pantalla van plegados. Se decide una sola vez: si cambiara
  // al marcar la última materia, la lista se cerraría de golpe y el foco se perdería.
  const [plegado] = useState(p.aprobadas === p.materias.length)
  const [aviso, setAviso] = useState<AvisoPeriodo | null>(null)
  const [enviando, setEnviando] = useState(false)
  const faltan = p.materias.filter((m) => m.estado !== 'aprobada')
  const sinEmpezar = p.materias.filter((m) => m.estado === 'pendiente')

  async function marcar(lista: Materia[], nuevo: EstadoMateria) {
    setAviso(null)
    setEnviando(true)
    const error = await acciones.cambiarVarias(lista, nuevo)
    setEnviando(false)
    if (error) {
      setAviso({ tipo: 'error', texto: `${error} (El período ${r} quedó como estaba.)` })
      return
    }
    const marcadas = lista.length === 1 ? 'marcada' : 'marcadas'
    const como = nuevo === 'aprobada' ? `${marcadas} como ${lista.length === 1 ? 'aprobada' : 'aprobadas'}` : `${marcadas} como cursando`
    setAviso({ tipo: 'hecho', texto: `${materias(lista.length)} ${como}.`, antes: lista, nuevo })
  }

  /** Cada materia vuelve a su estado de antes. Se agrupan por estado para hacerlo con pocas llamadas. */
  async function deshacer(antes: Materia[], nuevo: EstadoMateria) {
    setAviso(null)
    setEnviando(true)
    let error: string | null = null
    for (const estado of Object.keys(ESTADOS) as EstadoMateria[]) {
      const grupo = antes.filter((m) => m.estado === estado).map((m) => ({ ...m, estado: nuevo }))
      if (grupo.length) error = (await acciones.cambiarVarias(grupo, estado)) ?? error
    }
    setEnviando(false)
    if (error) setAviso({ tipo: 'error', texto: `${error} (No se pudo deshacer.)` })
  }

  const lista = (
    <ul className="pend-lista">
      {p.materias.map((m) => <FilaMateria key={m.id} m={m} enLinea={enLinea} acciones={acciones} />)}
    </ul>
  )
  const resumen = faltan.length ? `${creditos(p.creditos)} · ${p.aprobadas} de ${p.materias.length} aprobadas` : `${creditos(p.creditos)} · aprobado`

  return (
    <section id={`periodo-${p.numero}`} className="periodo" aria-labelledby={`h-periodo-${p.numero}`}>
      <h2 className="sec-h" id={`h-periodo-${p.numero}`}><span>Período {r}</span><span className="c">{resumen}</span></h2>
      {plegado ? (
        <details className="mas">
          <summary>Ver las materias</summary>
          {lista}
        </details>
      ) : lista}
      {faltan.length > 0 && (
        <div className="acciones periodo-acc">
          {sinEmpezar.length > 0 && (
            <button type="button" className="btn btn-q" onClick={() => marcar(sinEmpezar, 'cursando')} disabled={!enLinea || enviando}>
              Cursar el período {r}
            </button>
          )}
          <button type="button" className="btn btn-q" onClick={() => marcar(faltan, 'aprobada')} disabled={!enLinea || enviando}>
            Aprobar el período {r}
          </button>
        </div>
      )}
      {aviso?.tipo === 'hecho' && (
        <p className="aviso" role="status">
          {aviso.texto}
          <span className="acc">
            <button type="button" className="btn btn-q" onClick={() => deshacer(aviso.antes, aviso.nuevo)} disabled={!enLinea || enviando}>Deshacer</button>
          </span>
        </p>
      )}
      {aviso?.tipo === 'error' && <p className="alerta" role="alert">{aviso.texto}</p>}
    </section>
  )
}

/** La primera vez: cargar el plan de UNITEC con un botón, o agregar las materias una por una. */
function SinPlan({ acciones, enLinea }: { acciones: AccionesEstudios; enLinea: boolean }) {
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function cargarPlan() {
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.agregar(MATERIAS_DEL_PLAN)
    setEnviando(false)
    if (error) {
      setMensaje(error)
      // Puede que el plan ya se haya cargado desde otro celular: se vuelve a pedir la lista.
      acciones.recargar()
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>Carga tu plan de estudios</h1>
      <p className="bajada">
        {PLAN.nombre} de {PLAN.universidad}, plan {PLAN.version}: {PLAN.periodos} períodos y {PLAN.creditos} créditos.
        Después marcas lo que ya aprobaste.
      </p>
      <div className="acciones">
        <button type="button" className="btn btn-lleno" onClick={cargarPlan} disabled={!enLinea || enviando}>
          {enviando ? 'Cargando el plan…' : 'Cargar el plan'}
        </button>
        <a className="btn btn-q" href={PLAN.fuente} target="_blank" rel="noreferrer">Ver el plan oficial (PDF)</a>
      </div>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
      <p className="ayuda otro-plan">¿Otra carrera u otro plan? Agrega tus materias una por una.</p>
      <AgregarMateria agregar={acciones.agregar} enLinea={enLinea} periodoInicial={1} />
    </>
  )
}

export function PantallaEstudios({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesEstudios
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const fecha = fechaCorta(hoyEnElCelular())

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Estudios" fecha={fecha} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Estudios' : 'No se pudo cargar tu plan de estudios'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tu plan de estudios…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu plan por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const falloAviso = estado.fallo && enLinea && (
    <p className="aviso">
      No se pudo actualizar el plan. Lo que ves es lo último guardado.
      <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
    </p>
  )

  if (!estado.lista.length) {
    return (
      <Marco nombre="Estudios" fecha={fecha} nav={nav} cuenta={cuenta}>
        {avisos}
        {falloAviso}
        <SinPlan acciones={acciones} enLinea={enLinea} />
      </Marco>
    )
  }

  const a = calcularAvance(estado.lista)
  const periodos = porPeriodo(estado.lista)

  return (
    <Marco nombre="Estudios" fecha={fecha} nav={nav} cuenta={cuenta}>
      {avisos}
      {falloAviso}
      <h1 tabIndex={-1}>{a.aprobados} de {creditos(a.total)}</h1>
      <AvanceCarrera a={a} />
      {periodos.map((p) => <SeccionPeriodo key={p.numero} p={p} enLinea={enLinea} acciones={acciones} />)}
      <AgregarMateria agregar={acciones.agregar} enLinea={enLinea} periodoInicial={periodos.at(-1)?.numero ?? 1} />
    </Marco>
  )
}
