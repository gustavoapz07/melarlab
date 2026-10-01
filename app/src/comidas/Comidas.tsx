// Pantalla Comidas: qué hay de comer hoy, anotar en segundos (el momento sale de la hora), planear los
// próximos días y ver cuántas comidas de la semana fueron hechas en casa. Un solo formulario anota, cambia
// y borra: las listas solo eligen el día y el momento.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Marco } from '../Marco.tsx'
import { cuandoFue, fechaCorta, hoyEnElCelular, sumarDiasISO } from '../mi-dia/formato.ts'
import {
  DIAS_DE_PLAN, LARGO, LISTA_MOMENTOS, MOMENTOS, caseras, comidaDe, delDia, momentoDeAhora,
  type Comida, type EstadoComidas, type Momento, type NuevaComida,
} from './useComidas.ts'

export interface AccionesComidas {
  estado: EstadoComidas
  agregar: (nueva: NuevaComida) => Promise<{ id: string } | { mensaje: string }>
  cambiar: (original: Comida, cambios: Partial<NuevaComida>) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

/** Qué día y qué momento está editando el formulario. Fecha vacía es hoy. */
interface Hueco { fecha: string; momento: Momento }

/** "el almuerzo de hoy", "la cena de mañana", "el desayuno del sábado 3 de octubre" */
function delMomento(fecha: string, momento: Momento): string {
  const articulo = momento === 'cena' || momento === 'merienda' ? 'la' : 'el'
  const cuando = cuandoFue(fecha).toLowerCase()
  const de = cuando === 'hoy' || cuando === 'ayer' || cuando === 'mañana' ? 'de' : 'del'
  return `${articulo} ${MOMENTOS[momento].toLowerCase()} ${de} ${cuando}`
}

/** Fecha con atajos para ayer, hoy y mañana: sirve para anotar lo que se comió y para planear. Vacío es hoy. */
function CampoFecha({ id, valor, cambiar }: { id: string; valor: string; cambiar: (v: string) => void }) {
  const hoy = hoyEnElCelular()
  const atajos: [string, string][] = [['Ayer', sumarDiasISO(hoy, -1)], ['Hoy', ''], ['Mañana', sumarDiasISO(hoy, 1)]]
  return (
    <div className="campo">
      <label htmlFor={id}>Día</label>
      <input id={id} type="date" value={valor || hoy} max={sumarDiasISO(hoy, DIAS_DE_PLAN)} required
        onChange={(e) => cambiar(e.target.value === hoy ? '' : e.target.value)} />
      <div className="atajos">
        {atajos.map(([nombre, fecha]) => (
          <button key={nombre} type="button" className="btn btn-q" aria-pressed={valor === fecha} onClick={() => cambiar(fecha)}>{nombre}</button>
        ))}
      </div>
    </div>
  )
}

type Hecho = { texto: string; id?: string }

/**
 * El formulario. Si el día y el momento elegidos ya tienen comida, la muestra y guardar la cambia (y se
 * puede borrar). Se vuelve a montar cuando una lista elige otro hueco, para cargar lo que ya hay ahí.
 */
function Anotar({ lista, acciones, enLinea, inicio, enfocar }: {
  lista: Comida[]
  acciones: AccionesComidas
  enLinea: boolean
  inicio: Hueco
  enfocar: boolean
}) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const hoy = hoyEnElCelular()
  const valoresDe = (h: Hueco) => {
    const c = comidaDe(lista, h.fecha || hoy, h.momento)
    return { comida: c?.comida ?? '', casera: c?.casera ?? false, notas: c?.notas ?? '' }
  }
  const [hueco, setHueco] = useState(inicio)
  const [valores, setValores] = useState(() => valoresDe(inicio))
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const fecha = hueco.fecha || hoy
  const existente = comidaDe(lista, fecha, hueco.momento)

  function elegir(nuevo: Hueco) {
    setHueco(nuevo)
    setValores(valoresDe(nuevo))
    setConfirmar(false)
    setMensaje(null)
    setHecho(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const comida = valores.comida.trim()
    if (!comida) {
      setMensaje('Escribe qué hay de comer.')
      campo.current?.focus()
      return
    }
    const datos: NuevaComida = { fecha, momento: hueco.momento, comida, casera: valores.casera, notas: valores.notas.trim() || null }
    setEnviando(true)
    setMensaje(null)
    setHecho(null)
    const nombre = MOMENTOS[hueco.momento]
    if (existente) {
      const error = await acciones.cambiar(existente, datos)
      setEnviando(false)
      if (error) setMensaje(error)
      else setHecho({ texto: `${nombre} cambiado: ${comida}.` })
      return
    }
    const r = await acciones.agregar(datos)
    setEnviando(false)
    if ('mensaje' in r) setMensaje(r.mensaje)
    else setHecho({ texto: `${nombre} ${fecha > hoy ? 'planeado' : 'anotado'}: ${comida}.`, id: r.id })
  }

  async function quitar(comida: string, despues: string) {
    setEnviando(true)
    const error = await acciones.borrar(comida)
    setEnviando(false)
    setConfirmar(false)
    if (error) {
      setMensaje(error)
      return
    }
    setValores({ comida: '', casera: false, notas: '' })
    setHecho({ texto: despues })
  }

  return (
    <form className="anotar" onSubmit={guardar} aria-label="Anotar una comida">
      <fieldset className="chips momentos">
        <legend>Momento</legend>
        <div className="chips-grid">
          {LISTA_MOMENTOS.map((m) => (
            <button key={m} type="button" className="btn chip" aria-pressed={hueco.momento === m} onClick={() => elegir({ ...hueco, momento: m })}>
              {MOMENTOS[m]}
            </button>
          ))}
        </div>
      </fieldset>
      <CampoFecha id={`${id}-fecha`} valor={hueco.fecha} cambiar={(f) => elegir({ ...hueco, fecha: f })} />
      <div className="campo">
        <label htmlFor={`${id}-comida`}>¿Qué hay de comer?</label>
        <input ref={campo} id={`${id}-comida`} value={valores.comida} maxLength={LARGO.comida} autoComplete="off" autoFocus={enfocar}
          placeholder="Como «pollo con arroz y ensalada»" onChange={(e) => setValores((v) => ({ ...v, comida: e.target.value }))} />
      </div>
      <label className="casilla">
        <input type="checkbox" checked={valores.casera} onChange={(e) => setValores((v) => ({ ...v, casera: e.target.checked }))} />
        Hecha en casa
      </label>
      <details className="mas">
        <summary>Notas{valores.notas.trim() && <span className="marcas"> · con notas</span>}</summary>
        <div className="campo">
          <label htmlFor={`${id}-notas`}>Notas</label>
          <textarea id={`${id}-notas`} value={valores.notas} maxLength={LARGO.notas} rows={2}
            onChange={(e) => setValores((v) => ({ ...v, notas: e.target.value }))} />
        </div>
      </details>
      {existente && <p className="ayuda">Ya hay algo para {delMomento(fecha, hueco.momento)}: guardar lo cambia.</p>}
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Guardando…' : existente ? 'Cambiar' : 'Guardar'}</button>
        {existente && (confirmar ? (
          <span className="confirmar">
            <span>¿Borrar {delMomento(fecha, hueco.momento)}?</span>
            <button type="button" className="btn" disabled={!enLinea || enviando} onClick={() => quitar(existente.id, 'Listo, se borró.')}>Sí, borrar</button>
            <button type="button" className="btn btn-q" onClick={() => setConfirmar(false)}>No</button>
          </span>
        ) : (
          <button type="button" className="btn btn-q borrar" disabled={!enLinea} onClick={() => setConfirmar(true)}>Borrar</button>
        ))}
      </div>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
      <div role="status">
        {hecho && (
          <p className="aviso aviso-fuerte">
            {hecho.texto}
            {hecho.id && (
              <span className="acc">
                <button type="button" className="btn btn-q" disabled={!enLinea || enviando}
                  onClick={() => hecho.id && quitar(hecho.id, 'Listo, se quitó.')}>Deshacer</button>
              </span>
            )}
          </p>
        )}
      </div>
    </form>
  )
}

/** Una fila por momento de un día: lo que hay (o "Sin anotar") y el botón que lo lleva al formulario. */
function Dia({ lista, fecha, soloConComida, elegir, enLinea }: {
  lista: Comida[]
  fecha: string
  soloConComida?: boolean
  elegir: (h: Hueco) => void
  enLinea: boolean
}) {
  const filas = LISTA_MOMENTOS.map((m) => ({ m, c: comidaDe(lista, fecha, m) })).filter((f) => !soloConComida || f.c)
  return (
    <ul className="pend-lista">
      {filas.map(({ m, c }) => (
        <li key={m} className={c ? 'mov comida' : 'mov comida vacia'}>
          <div className="mov-cuerpo">
            <p className="k">{MOMENTOS[m]}</p>
            <p className="mov-t">{c ? c.comida : 'Sin anotar'}</p>
            {c?.casera && <p className="meta">Hecha en casa</p>}
          </div>
          <button type="button" className="btn btn-q" disabled={!enLinea} onClick={() => elegir({ fecha, momento: m })}
            aria-label={`${c ? 'Cambiar' : 'Anotar'} ${delMomento(fecha, m)}`}>
            {c ? 'Cambiar' : 'Anotar'}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function PantallaComidas({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesComidas
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const hoy = hoyEnElCelular()
  const ahora = momentoDeAhora()
  // Lo que eligen las listas. La versión vuelve a montar el formulario para cargar lo que hay en ese hueco.
  const [elegido, setElegido] = useState<{ hueco: Hueco; version: number }>({ hueco: { fecha: '', momento: ahora }, version: 0 })

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Comidas" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Comidas' : 'No se pudieron cargar tus comidas'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus comidas…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tus comidas por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const { lista } = estado
  const deAhora = comidaDe(lista, hoy, ahora)
  const elegir = (hueco: Hueco) => {
    setElegido((e) => ({ hueco: hueco.fecha === hoy ? { ...hueco, fecha: '' } : hueco, version: e.version + 1 }))
    document.getElementById('anotar')?.scrollIntoView({ block: 'start' })
  }
  const proximos = Array.from({ length: 7 }, (_, i) => sumarDiasISO(hoy, i + 1))
  const pasados = Array.from({ length: 6 }, (_, i) => sumarDiasISO(hoy, -(i + 1))).filter((f) => delDia(lista, f).length)
  const semana = caseras(lista, hoy)

  return (
    <Marco nombre="Comidas" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudieron actualizar tus comidas. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{deAhora ? `${MOMENTOS[ahora]}: ${deAhora.comida}` : `¿Qué hay de ${MOMENTOS[ahora].toLowerCase()}?`}</h1>
      <section id="hoy" aria-labelledby="h-hoy">
        <h2 className="sec-h" id="h-hoy"><span>Hoy</span><span className="c">{delDia(lista, hoy).length} de 4</span></h2>
        <Dia lista={lista} fecha={hoy} elegir={elegir} enLinea={enLinea} />
      </section>
      <section id="anotar" aria-labelledby="h-anotar">
        <h2 className="sec-h" id="h-anotar"><span>Anotar o planear</span></h2>
        <Anotar key={elegido.version} lista={lista} acciones={acciones} enLinea={enLinea} inicio={elegido.hueco} enfocar={elegido.version > 0} />
      </section>
      <section id="proximos" aria-labelledby="h-proximos">
        <h2 className="sec-h" id="h-proximos"><span>Próximos días</span></h2>
        {proximos.map((f) => (
          <div key={f} className="dia">
            <h3 className="sub">{cuandoFue(f)}</h3>
            {delDia(lista, f).length
              ? <Dia lista={lista} fecha={f} soloConComida elegir={elegir} enLinea={enLinea} />
              : (
                <p className="nada">
                  Nada planeado.
                  <button type="button" className="btn btn-q" disabled={!enLinea} onClick={() => elegir({ fecha: f, momento: 'almuerzo' })}
                    aria-label={`Planear ${cuandoFue(f).toLowerCase()}`}>Planear</button>
                </p>
              )}
          </div>
        ))}
      </section>
      <section id="semana" aria-labelledby="h-semana">
        <h2 className="sec-h" id="h-semana"><span>Últimos 7 días</span><span className="c">{semana.total} {semana.total === 1 ? 'comida' : 'comidas'}</span></h2>
        <dl className="cap">
          <div><dt>Hechas en casa</dt><dd>{semana.total ? `${semana.caseras} de ${semana.total}` : 'Sin comidas'}</dd></div>
          <div><dt>Parte</dt><dd>{semana.total ? `${Math.round((semana.caseras / semana.total) * 100)} %` : 'Sin comidas'}</dd></div>
        </dl>
        {pasados.length > 0 && (
          <details className="mas">
            <summary>Lo que comí</summary>
            {pasados.map((f) => (
              <div key={f} className="dia">
                <h3 className="sub">{cuandoFue(f)}</h3>
                <Dia lista={lista} fecha={f} soloConComida elegir={elegir} enLinea={enLinea} />
              </div>
            ))}
          </details>
        )}
      </section>
    </Marco>
  )
}
