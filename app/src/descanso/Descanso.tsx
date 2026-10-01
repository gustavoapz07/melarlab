// Pantalla Descanso: anotar la noche en segundos (a qué hora me dormí y me desperté, y si quiero, qué tan
// bien dormí), cómo vengo durmiendo en la semana, las barras de las últimas dos semanas y las noches anotadas.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { CampoFechaPasada, Opciones } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { cuandoFue, diaSemana, fechaCorta, hoyEnElCelular, leerFecha, sumarDiasISO } from '../mi-dia/formato.ts'
import {
  CALIDADES, LARGO, META_HORAS, NOCHES_PARA_AVISAR, duracion, horaRedondeada, horasEntre, porFecha, resumirSueno,
  type EstadoDescanso, type Noche, type NuevaNoche,
} from './useDescanso.ts'

export interface AccionesDescanso {
  estado: EstadoDescanso
  agregar: (nueva: NuevaNoche) => Promise<{ id: string } | { mensaje: string }>
  cambiar: (original: Noche, cambios: Partial<NuevaNoche>) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

/** Más de esto no es una noche: seguramente una hora quedó mal (AM y PM, por ejemplo). */
const MAXIMO_HORAS = 16

/** Lo que dice si las horas no sirven, o null si están bien. */
function revisarHoras(dormi: string, desperte: string): string | null {
  if (!dormi || !desperte) return 'Falta la hora de dormir o la de despertar.'
  const horas = horasEntre(dormi, desperte)
  if (horas === 0) return 'La hora de dormir y la de despertar son iguales.'
  if (horas > MAXIMO_HORAS) return `Son ${duracion(horas)}: revisa las horas (¿la mañana y la tarde están bien?).`
  return null
}

/** Qué tan bien dormí: cinco botones; tocar el elegido lo quita. */
function CampoCalidad({ valor, cambiar }: { valor: number | null; cambiar: (v: number | null) => void }) {
  return (
    <fieldset className="chips calidad">
      <legend>¿Cómo dormiste? Opcional</legend>
      <div className="chips-grid">
        {Object.entries(CALIDADES).map(([n, nombre]) => (
          <button key={n} type="button" className="btn chip" aria-pressed={valor === Number(n)}
            onClick={() => cambiar(valor === Number(n) ? null : Number(n))}>{nombre}</button>
        ))}
      </div>
    </fieldset>
  )
}

type Hecho = { texto: string; id?: string }

/** "la noche de hoy", "de ayer" o "del lunes 28 de septiembre". */
function laNoche(fecha: string): string {
  const cuando = cuandoFue(fecha).toLowerCase()
  return `la noche ${cuando === 'hoy' || cuando === 'ayer' ? 'de' : 'del'} ${cuando}`
}

/** Anotar la noche. Si la fecha elegida ya tiene una, el formulario la muestra y guardar la cambia. */
function Anotar({ lista, acciones, enLinea }: { lista: Noche[]; acciones: AccionesDescanso; enLinea: boolean }) {
  const id = useId()
  const mapa = porFecha(lista)
  const ultima = lista[0]

  /** Lo que propone el formulario para una fecha: la noche ya anotada, o las horas de costumbre. */
  function valoresPara(fecha: string) {
    const existente = mapa.get(fecha || hoyEnElCelular())
    if (existente) return { dormi: existente.me_dormi, desperte: existente.me_desperte, calidad: existente.calidad, notas: existente.notas ?? '' }
    const ahora = horaRedondeada()
    // Entre las 3 y las 13, lo más probable es que se esté anotando recién despierto.
    const recienDespierto = ahora >= '03:00' && ahora < '13:00' && !fecha
    return {
      dormi: ultima?.me_dormi ?? '23:00',
      desperte: recienDespierto ? ahora : ultima?.me_desperte ?? '06:00',
      calidad: null,
      notas: '',
    }
  }

  const [fecha, setFecha] = useState('')
  const [valores, setValores] = useState(() => valoresPara(''))
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const existente = mapa.get(fecha || hoyEnElCelular())
  const problema = revisarHoras(valores.dormi, valores.desperte)
  const cambiar = (cambios: Partial<typeof valores>) => setValores((v) => ({ ...v, ...cambios }))

  function cambiarFecha(nueva: string) {
    setFecha(nueva)
    setValores(valoresPara(nueva))
    setHecho(null)
    setMensaje(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (problema) {
      setMensaje(problema)
      return
    }
    const noche: NuevaNoche = {
      fecha: fecha || hoyEnElCelular(), me_dormi: valores.dormi, me_desperte: valores.desperte,
      calidad: valores.calidad, notas: valores.notas.trim() || null,
    }
    setEnviando(true)
    setMensaje(null)
    setHecho(null)
    const horas = duracion(horasEntre(noche.me_dormi, noche.me_desperte))
    if (existente) {
      const error = await acciones.cambiar(existente, noche)
      setEnviando(false)
      if (error) setMensaje(error)
      else setHecho({ texto: `Noche cambiada: ${horas}.` })
      return
    }
    const r = await acciones.agregar(noche)
    setEnviando(false)
    if ('mensaje' in r) setMensaje(r.mensaje)
    else setHecho({ texto: `Noche anotada: ${horas}.`, id: r.id })
  }

  async function deshacer(noche: string) {
    setEnviando(true)
    const error = await acciones.borrar(noche)
    setEnviando(false)
    if (error) setMensaje(error)
    else setHecho({ texto: 'Listo, se quitó.' })
  }

  const marcas = [fecha ? cuandoFue(fecha) : null, valores.notas.trim() ? 'con notas' : null].filter(Boolean)
  const horas = horasEntre(valores.dormi, valores.desperte)

  return (
    <form className="anotar" onSubmit={guardar} aria-label="Anotar la noche">
      <div className="fila horas">
        <div className="campo">
          <label htmlFor={`${id}-dormi`}>Me dormí</label>
          <input id={`${id}-dormi`} type="time" required value={valores.dormi} onChange={(e) => cambiar({ dormi: e.target.value })} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-desperte`}>Me desperté</label>
          <input id={`${id}-desperte`} type="time" required value={valores.desperte} onChange={(e) => cambiar({ desperte: e.target.value })} />
        </div>
      </div>
      {!problema && (
        <p className="calculo">
          Son <b>{duracion(horas)}</b>{horas < META_HORAS ? `, menos de las ${META_HORAS} h de la meta` : ''}.
        </p>
      )}
      <CampoCalidad valor={valores.calidad} cambiar={(calidad) => cambiar({ calidad })} />
      <details className="mas">
        <summary>Fecha y notas{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <CampoFechaPasada id={`${id}-fecha`} etiqueta="Día en que despertaste" valor={fecha} cambiar={cambiarFecha} />
        <div className="campo">
          <label htmlFor={`${id}-notas`}>Notas</label>
          <textarea id={`${id}-notas`} value={valores.notas} onChange={(e) => cambiar({ notas: e.target.value })} maxLength={LARGO.notas} rows={2}
            placeholder="Opcional, como «me desperté a las 3»" />
        </div>
      </details>
      {existente && <p className="ayuda">Ya anotaste {laNoche(existente.fecha)}: guardar la cambia.</p>}
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>
          {enviando ? 'Guardando…' : existente ? 'Cambiar la noche' : 'Guardar la noche'}
        </button>
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

const INICIALES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Las horas de las últimas dos semanas, una barra por noche, con la meta como línea. Es decorativa para
 * el lector de pantalla: las mismas noches, con sus horas, están en la lista de abajo.
 */
function Barras({ lista, hoy }: { lista: Noche[]; hoy: string }) {
  const mapa = porFecha(lista)
  const dias = Array.from({ length: 14 }, (_, i) => sumarDiasISO(hoy, i - 13))
  const tope = Math.max(10, ...dias.map((d) => Math.ceil(mapa.get(d)?.horas ?? 0)))
  const alto = 80
  const y = (h: number) => 6 + alto - (h / tope) * alto
  return (
    <svg className="barras" viewBox="0 0 280 104" aria-hidden="true" focusable="false">
      <line className="s4" x1="0" x2="280" y1={y(0)} y2={y(0)} />
      {dias.map((d, i) => {
        const n = mapa.get(d)
        const x = i * 20 + 6
        return (
          <g key={d}>
            {n && n.horas > 0 && (
              <rect className="f1" x={x} y={y(n.horas)} width="8" height={y(0) - y(n.horas)}>
                <title>{`${cuandoFue(d)}: ${duracion(n.horas)}`}</title>
              </rect>
            )}
            <text className={d === hoy ? 'lbl lbl-hoy' : 'lbl'} x={x + 4} y="102" textAnchor="middle">{INICIALES[diaSemana(leerFecha(d))]}</text>
          </g>
        )
      })}
      <line className="meta-linea" x1="0" x2="280" y1={y(META_HORAS)} y2={y(META_HORAS)} />
      <text className="lbl" x="280" y={y(META_HORAS) - 3} textAnchor="end">{`Meta ${META_HORAS} h`}</text>
    </svg>
  )
}

function Semana({ lista, hoy }: { lista: Noche[]; hoy: string }) {
  const r = resumirSueno(lista, hoy)
  return (
    <section id="semana" aria-labelledby="h-semana">
      <h2 className="sec-h" id="h-semana"><span>Últimos 7 días</span><span className="c">{r.noches} {r.noches === 1 ? 'noche' : 'noches'}</span></h2>
      <dl className="cap">
        <div><dt>Promedio</dt><dd>{r.promedio === null ? 'Sin noches' : duracion(r.promedio)}</dd></div>
        <div><dt>Meta</dt><dd>{META_HORAS} h</dd></div>
        <div><dt>Noches cortas</dt><dd>{r.cortas} de {r.noches}</dd></div>
        <div><dt>Calidad</dt><dd>{r.calidad === null ? 'Sin anotar' : CALIDADES[Math.round(r.calidad)]}</dd></div>
      </dl>
      <Barras lista={lista} hoy={hoy} />
    </section>
  )
}

function EditorNoche({ n, acciones, cerrar }: { n: Noche; acciones: AccionesDescanso; cerrar: () => void }) {
  const id = useId()
  const [fecha, setFecha] = useState(n.fecha)
  const [dormi, setDormi] = useState(n.me_dormi)
  const [desperte, setDesperte] = useState(n.me_desperte)
  const [calidad, setCalidad] = useState(n.calidad === null ? '' : String(n.calidad))
  const [notas, setNotas] = useState(n.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const problema = revisarHoras(dormi, desperte)
    if (problema) {
      setMensaje(problema)
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(n, {
      fecha: fecha || n.fecha, me_dormi: dormi, me_desperte: desperte, calidad: calidad ? Number(calidad) : null, notas: notas.trim() || null,
    })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(n.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar ${laNoche(n.fecha)}`}>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-dormi`}>Me dormí</label>
          {/* El foco va al campo que se acaba de abrir. */}
          <input id={`${id}-dormi`} type="time" required value={dormi} onChange={(e) => setDormi(e.target.value)} autoFocus />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-desperte`}>Me desperté</label>
          <input id={`${id}-desperte`} type="time" required value={desperte} onChange={(e) => setDesperte(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-fecha`}>Día en que despertaste</label>
          <input id={`${id}-fecha`} type="date" required value={fecha} max={hoyEnElCelular()} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-calidad`}>Cómo dormiste</label>
          <select id={`${id}-calidad`} value={calidad} onChange={(e) => setCalidad(e.target.value)}>
            <option value="">Sin anotar</option>
            <Opciones opciones={CALIDADES} />
          </select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-notas`}>Notas</label>
        <textarea id={`${id}-notas`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={LARGO.notas} rows={2} />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar esta noche?</span>
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

function FilaNoche({ n, enLinea, acciones }: { n: Noche; enLinea: boolean; acciones: AccionesDescanso }) {
  const [editando, setEditando] = useState(false)
  if (editando) return <li className="mov editando"><EditorNoche n={n} acciones={acciones} cerrar={() => setEditando(false)} /></li>
  const cuando = cuandoFue(n.fecha)
  return (
    <li className="mov">
      <div className="mov-cuerpo">
        <p className="mov-t">{cuando}</p>
        <p className="meta">{[`${n.me_dormi} → ${n.me_desperte}`, n.calidad ? CALIDADES[n.calidad] : null].filter(Boolean).join(' · ')}</p>
        {n.notas && <p className="x">{n.notas}</p>}
      </div>
      <p className="mov-m">
        {duracion(n.horas)}
        {n.horas < META_HORAS && <span className="sr"> (menos de la meta)</span>}
      </p>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea}
        aria-label={`Editar ${laNoche(n.fecha)}`}>
        Editar
      </button>
    </li>
  )
}

function Noches({ lista, hoy, enLinea, acciones }: { lista: Noche[]; hoy: string; enLinea: boolean; acciones: AccionesDescanso }) {
  const desde = sumarDiasISO(hoy, -13)
  const recientes = [...porFecha(lista).values()].filter((n) => n.fecha >= desde).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  if (!recientes.length) return null
  return (
    <section id="noches" aria-labelledby="h-noches">
      <h2 className="sec-h" id="h-noches"><span>Noches · últimas dos semanas</span><span className="c">{recientes.length}</span></h2>
      <ul className="pend-lista">
        {recientes.map((n) => <FilaNoche key={n.id} n={n} enLinea={enLinea} acciones={acciones} />)}
      </ul>
    </section>
  )
}

export function PantallaDescanso({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesDescanso
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const hoy = hoyEnElCelular()

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Descanso" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Descanso' : 'No se pudo cargar tu descanso'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus noches…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu descanso por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const r = resumirSueno(estado.lista, hoy)

  return (
    <Marco nombre="Descanso" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar tu descanso. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{r.anoche ? `Dormiste ${duracion(r.anoche.horas)}` : '¿Cómo dormiste?'}</h1>
      {r.seguidasCortas >= NOCHES_PARA_AVISAR && (
        <p className="alerta">Llevas {r.seguidasCortas} noches seguidas durmiendo menos de {META_HORAS} horas.</p>
      )}
      <Anotar lista={estado.lista} acciones={acciones} enLinea={enLinea} />
      {estado.lista.length > 0 && <Semana lista={estado.lista} hoy={hoy} />}
      <Noches lista={estado.lista} hoy={hoy} enLinea={enLinea} acciones={acciones} />
    </Marco>
  )
}
