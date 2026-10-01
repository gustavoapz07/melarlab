// Pantalla Gym: si hoy toca, anotar el entreno en segundos (la rutina de hoy ya viene puesta), la semana
// de lunes a domingo contra el plan, el plan de la semana y los entrenos anotados.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { CampoFechaPasada } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { cuandoFue, fechaCorta, hoyEnElCelular } from '../mi-dia/formato.ts'
import {
  LARGO, NOMBRES_DIAS, RANGO_MINUTOS, cuentaDeLaSemana, minutos, numeroDeDia, resumirGym, semanaDe,
  type DiaDelPlan, type Entreno, type EstadoEntrenos, type EstadoPlan, type NuevoEntreno,
} from './useGym.ts'

export interface AccionesGym {
  entrenos: EstadoEntrenos
  plan: EstadoPlan
  agregar: (nuevo: NuevoEntreno) => Promise<{ id: string } | { mensaje: string }>
  cambiar: (original: Entreno, cambios: Partial<NuevoEntreno>) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  guardarPlan: (rutinas: Record<number, string>) => Promise<string | null>
  recargar: () => void
}

const DURACIONES = [30, 45, 60, 90]

/** Lee los minutos escritos a mano: vacío es "sin anotar"; fuera de rango, NaN. */
function leerMinutos(texto: string): number | null {
  if (!texto.trim()) return null
  const n = Number(texto)
  return Number.isInteger(n) && n >= RANGO_MINUTOS[0] && n <= RANGO_MINUTOS[1] ? n : NaN
}
const MINUTOS_INVALIDOS = `Los minutos van de ${RANGO_MINUTOS[0]} a ${RANGO_MINUTOS[1]}, sin decimales.`

/** La semana de lunes a domingo: qué toca cada día según el plan y si ya se entrenó. */
function Semana({ entrenos, plan, hoy }: { entrenos: Entreno[]; plan: DiaDelPlan[]; hoy: string }) {
  return (
    <ol className="semana-gym" aria-label="Esta semana">
      {semanaDe(hoy).map((fecha, i) => {
        const toca = plan.find((p) => p.dia === i + 1)?.rutina
        // Si ese día se entrenó, se ve lo que se hizo, aunque el plan dijera otra cosa.
        const hecho = entrenos.find((e) => e.fecha === fecha)?.rutina
        const estado = hecho ? 'hecho' : toca ? (fecha < hoy ? 'falto' : 'toca') : 'descanso'
        const texto = hecho ? `entrenado, ${hecho}` : toca ? (fecha < hoy ? `tocaba ${toca}, sin entrenar` : `toca ${toca}`) : 'descanso'
        return (
          <li key={fecha} className={`dia-gym ${estado}${fecha === hoy ? ' hoy' : ''}`} aria-current={fecha === hoy ? 'date' : undefined}>
            <span className="dia-gym-n" aria-hidden="true">{NOMBRES_DIAS[i].slice(0, 1)}</span>
            <span className="dia-gym-marca" aria-hidden="true">{hecho ? '✓' : ''}</span>
            <span className="dia-gym-r" aria-hidden="true">{hecho ?? toca ?? '·'}</span>
            <span className="sr">{NOMBRES_DIAS[i]}: {texto}.</span>
          </li>
        )
      })}
    </ol>
  )
}

type Hecho = { texto: string; id?: string }

function Anotar({ acciones, entrenos, plan, enLinea }: { acciones: AccionesGym; entrenos: Entreno[]; plan: DiaDelPlan[]; enLinea: boolean }) {
  const id = useId()
  const hoy = hoyEnElCelular()
  const tocaHoy = plan.find((p) => p.dia === numeroDeDia(hoy))?.rutina ?? ''
  const yaHoy = entrenos.some((e) => e.fecha === hoy)
  // Atajos: las rutinas del plan y las últimas que se anotaron, sin repetir.
  const atajos = [...new Set([...plan.map((p) => p.rutina), ...entrenos.map((e) => e.rutina)])].slice(0, 6)
  const [rutina, setRutina] = useState(yaHoy ? '' : tocaHoy)
  const [duracion, setDuracion] = useState<number | null>(null)
  const [minutosTxt, setMinutos] = useState('')
  const [fecha, setFecha] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const r = rutina.trim()
    if (!r) {
      setMensaje('Escribe qué entrenaste, o toca una rutina.')
      return
    }
    const exactos = leerMinutos(minutosTxt)
    if (Number.isNaN(exactos)) {
      setMensaje(MINUTOS_INVALIDOS)
      return
    }
    setEnviando(true)
    setMensaje(null)
    setHecho(null)
    const duracion_min = exactos ?? duracion
    const res = await acciones.agregar({ fecha: fecha || hoyEnElCelular(), rutina: r, duracion_min, notas: notas.trim() || null })
    setEnviando(false)
    if ('mensaje' in res) {
      setMensaje(res.mensaje)
      return
    }
    setHecho({ texto: `Entreno anotado: ${r}${duracion_min ? `, ${minutos(duracion_min)}` : ''}.`, id: res.id })
    setRutina('')
    setDuracion(null)
    setMinutos('')
    setNotas('')
  }

  async function deshacer(entreno: string) {
    setEnviando(true)
    const error = await acciones.borrar(entreno)
    setEnviando(false)
    if (error) setMensaje(error)
    else setHecho({ texto: 'Listo, se quitó.' })
  }

  const marcas = [fecha ? cuandoFue(fecha) : null, minutosTxt.trim() ? `${minutosTxt.trim()} min` : null, notas.trim() ? 'con notas' : null].filter(Boolean)

  return (
    <form className="anotar" onSubmit={guardar} aria-label="Anotar el entreno">
      <div className="campo">
        <label htmlFor={`${id}-rutina`}>¿Qué entrenaste?</label>
        <input id={`${id}-rutina`} value={rutina} onChange={(e) => setRutina(e.target.value)} maxLength={LARGO.rutina} autoComplete="off"
          placeholder="Como «Pierna» o «Cardio»" />
        {atajos.length > 0 && (
          <div className="atajos" role="group" aria-label="Rutinas">
            {atajos.map((a) => (
              <button key={a} type="button" className="btn btn-q" aria-pressed={rutina.trim() === a} onClick={() => setRutina(a)}>{a}</button>
            ))}
          </div>
        )}
      </div>
      <fieldset className="chips duracion">
        <legend>¿Cuánto duró? Opcional</legend>
        <div className="chips-grid">
          {DURACIONES.map((d) => (
            <button key={d} type="button" className="btn chip" aria-pressed={duracion === d}
              onClick={() => { setDuracion(duracion === d ? null : d); setMinutos('') }}>{minutos(d)}</button>
          ))}
        </div>
      </fieldset>
      <details className="mas">
        <summary>Fecha, minutos exactos y notas{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <CampoFechaPasada id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
        <div className="campo">
          <label htmlFor={`${id}-minutos`}>Minutos exactos</label>
          <input id={`${id}-minutos`} inputMode="numeric" value={minutosTxt} autoComplete="off"
            onChange={(e) => { setMinutos(e.target.value); setDuracion(null) }} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-notas`}>Notas</label>
          <textarea id={`${id}-notas`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={LARGO.notas} rows={2}
            placeholder="Opcional, como «sentadilla 3 x 10 con 60 kg»" />
        </div>
      </details>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Guardando…' : 'Guardar el entreno'}</button>
      </div>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
      <div role="status">
        {hecho && (
          <p className="aviso aviso-fuerte">
            {hecho.texto}
            {hecho.id && (
              <span className="acc">
                <button type="button" className="btn btn-q" onClick={() => hecho.id && deshacer(hecho.id)} disabled={!enLinea || enviando}>Deshacer</button>
              </span>
            )}
          </p>
        )}
      </div>
    </form>
  )
}

/** El plan de la semana: una rutina por día; vacío es descanso. */
function Plan({ plan, acciones, enLinea }: { plan: DiaDelPlan[]; acciones: AccionesGym; enLinea: boolean }) {
  const id = useId()
  const [rutinas, setRutinas] = useState<Record<number, string>>(() => Object.fromEntries(plan.map((p) => [p.dia, p.rutina])))
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  // Abierto solo si todavía no hay plan. Se decide una vez: si cambiara al guardar, se cerraría y taparía el aviso.
  const [abierto] = useState(!plan.length)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando(true)
    setMensaje(null)
    setListo(false)
    const error = await acciones.guardarPlan(rutinas)
    setEnviando(false)
    if (error) setMensaje(error)
    else setListo(true)
  }

  return (
    <section id="plan" aria-labelledby="h-plan">
      <h2 className="sec-h" id="h-plan"><span>Plan de la semana</span><span className="c">{plan.length} {plan.length === 1 ? 'día' : 'días'}</span></h2>
      <details className="mas" open={abierto}>
        <summary>{plan.length ? 'Cambiar el plan' : 'Armar el plan'}</summary>
        <form className="editor" onSubmit={guardar} aria-label="Plan de la semana">
          <p className="ayuda">Qué rutina toca cada día. Los días vacíos son de descanso.</p>
          <div className="fila plan-dias">
            {NOMBRES_DIAS.map((nombre, i) => (
              <div className="campo" key={nombre}>
                <label htmlFor={`${id}-${i + 1}`}>{nombre}</label>
                <input id={`${id}-${i + 1}`} value={rutinas[i + 1] ?? ''} maxLength={LARGO.rutina} autoComplete="off" placeholder="Descanso"
                  onChange={(e) => { setRutinas((r) => ({ ...r, [i + 1]: e.target.value })); setListo(false) }} />
              </div>
            ))}
          </div>
          <div className="acciones">
            <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Guardando…' : 'Guardar el plan'}</button>
          </div>
          {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
          <div role="status">{listo && <p className="aviso aviso-fuerte">Plan guardado.</p>}</div>
        </form>
      </details>
    </section>
  )
}

function EditorEntreno({ e, acciones, cerrar }: { e: Entreno; acciones: AccionesGym; cerrar: () => void }) {
  const id = useId()
  const [rutina, setRutina] = useState(e.rutina)
  const [fecha, setFecha] = useState(e.fecha)
  const [minutosTxt, setMinutos] = useState(e.duracion_min === null ? '' : String(e.duracion_min))
  const [notas, setNotas] = useState(e.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(ev: FormEvent) {
    ev.preventDefault()
    if (enviando) return
    const r = rutina.trim()
    const duracion_min = leerMinutos(minutosTxt)
    if (!r) {
      setMensaje('Escribe qué entrenaste.')
      return
    }
    if (Number.isNaN(duracion_min)) {
      setMensaje(MINUTOS_INVALIDOS)
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(e, { rutina: r, fecha: fecha || e.fecha, duracion_min, notas: notas.trim() || null })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(e.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${e.rutina}, ${cuandoFue(e.fecha).toLowerCase()}`}>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-rutina`}>Qué entrenaste</label>
          {/* El foco va al campo que se acaba de abrir. */}
          <input id={`${id}-rutina`} value={rutina} onChange={(ev) => setRutina(ev.target.value)} maxLength={LARGO.rutina} autoComplete="off" autoFocus />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-fecha`}>Fecha</label>
          <input id={`${id}-fecha`} type="date" required value={fecha} max={hoyEnElCelular()} onChange={(ev) => setFecha(ev.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-minutos`}>Minutos</label>
          <input id={`${id}-minutos`} inputMode="numeric" value={minutosTxt} onChange={(ev) => setMinutos(ev.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-notas`}>Notas</label>
        <textarea id={`${id}-notas`} value={notas} onChange={(ev) => setNotas(ev.target.value)} maxLength={LARGO.notas} rows={2} />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar este entreno?</span>
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

function FilaEntreno({ e, enLinea, acciones }: { e: Entreno; enLinea: boolean; acciones: AccionesGym }) {
  const [editando, setEditando] = useState(false)
  if (editando) return <li className="mov editando"><EditorEntreno e={e} acciones={acciones} cerrar={() => setEditando(false)} /></li>
  const cuando = cuandoFue(e.fecha)
  return (
    <li className="mov">
      <div className="mov-cuerpo">
        <p className="mov-t">{e.rutina}</p>
        <p className="meta">{cuando}</p>
        {e.notas && <p className="x">{e.notas}</p>}
      </div>
      <p className="mov-m">{e.duracion_min ? minutos(e.duracion_min) : ''}</p>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea}
        aria-label={`Editar: ${e.rutina}, ${cuando.toLowerCase()}`}>
        Editar
      </button>
    </li>
  )
}

export function PantallaGym({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesGym
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const hoy = hoyEnElCelular()
  const { entrenos: e, plan: p } = acciones

  if (e.tipo !== 'listo' || p.tipo !== 'listo') {
    const cargando = e.tipo === 'cargando' || p.tipo === 'cargando'
    return (
      <Marco nombre="Gym" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{cargando ? 'Gym' : 'No se pudo cargar tu gym'}</h1>
        <p className="bajada" role={cargando ? 'status' : undefined}>
          {cargando ? 'Cargando tus entrenos…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu gym por primera vez hace falta internet.'}
        </p>
        {!cargando && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const r = resumirGym(e.lista, p.lista, hoy)
  const titulo = r.hoy ? `Hoy entrenaste ${r.hoy.rutina}` : r.tocaHoy ? `Hoy toca ${r.tocaHoy}` : r.hayPlan ? 'Hoy descansas' : cuentaDeLaSemana(r)
  // Por fecha y no por orden de llegada: un entreno de ayer anotado hoy va después de los de hoy.
  const recientes = [...e.lista].sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado < b.creado ? 1 : -1)).slice(0, 15)

  return (
    <Marco nombre="Gym" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {(e.fallo || p.fallo) && enLinea && (
        <p className="aviso">
          No se pudo actualizar tu gym. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{titulo}</h1>
      {(r.hayPlan || r.hechos > 0) && titulo !== cuentaDeLaSemana(r) && <p className="bajada">{cuentaDeLaSemana(r)}.</p>}
      {r.hayPlan && <Semana entrenos={e.lista} plan={p.lista} hoy={hoy} />}
      <Anotar acciones={acciones} entrenos={e.lista} plan={p.lista} enLinea={enLinea} />
      <Plan plan={p.lista} acciones={acciones} enLinea={enLinea} />
      {recientes.length > 0 && (
        <section id="entrenos" aria-labelledby="h-entrenos">
          <h2 className="sec-h" id="h-entrenos"><span>Entrenos</span><span className="c">{e.lista.length} en 60 días</span></h2>
          <ul className="pend-lista">
            {recientes.map((x) => <FilaEntreno key={x.id} e={x} enLinea={enLinea} acciones={acciones} />)}
          </ul>
        </section>
      )}
    </Marco>
  )
}
