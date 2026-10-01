// Pantalla Billetera: anotar un gasto en segundos (monto y tocar la categoría), el resumen del mes por
// categoría y los movimientos por día, con editar y borrar. Cada moneda se suma aparte: no se convierte.
import { useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { CampoFechaPasada, Opciones } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { cuandoFue, fechaCorta, hoyEnElCelular, mayuscula } from '../mi-dia/formato.ts'
import {
  CATEGORIAS, LARGO, MONEDAS, TIPOS, dinero, leerMonto, mesesVisibles, nombreDelMes, porDia, resumirMes, simbolo,
  totalEnPalabras,
  type CambiosMovimiento, type Categoria, type EstadoBilletera, type Movimiento, type NuevoMovimiento, type ResumenMoneda, type Tipo,
} from './useBilletera.ts'

export interface AccionesBilletera {
  estado: EstadoBilletera
  agregar: (nuevo: NuevoMovimiento) => Promise<{ id: string } | { mensaje: string }>
  cambiar: (original: Movimiento, cambios: CambiosMovimiento) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

const LISTA_CATEGORIAS = Object.keys(CATEGORIAS) as Categoria[]
const MONTO_INVALIDO = 'Escribe cuánto fue: un número mayor que 0, como 150 o 150.50.'

/** Las monedas de la app, más la del movimiento si es otra (la base acepta cualquier código). */
const monedasPara = (actual: string) => (actual in MONEDAS ? MONEDAS : { ...MONEDAS, [actual]: actual })

function CampoMonto({ id, valor, cambiar, moneda, refCampo, autoFocus, alEnter }: {
  id: string
  valor: string
  cambiar: (v: string) => void
  moneda: string
  refCampo?: Ref<HTMLInputElement>
  autoFocus?: boolean
  /** Enter en el campo. Sin esto, Enter envía el formulario (si tiene botón de guardar). */
  alEnter?: () => void
}) {
  return (
    <div className="campo">
      <label htmlFor={id}>¿Cuánto?<span className="sr"> En {(MONEDAS[moneda] ?? moneda).toLowerCase()}.</span></label>
      <div className="monto">
        <span className="monto-moneda" aria-hidden="true">{simbolo(moneda)}</span>
        <input ref={refCampo} id={id} value={valor} onChange={(e) => cambiar(e.target.value)} inputMode="decimal" autoComplete="off"
          enterKeyHint="done" placeholder="0.00" autoFocus={autoFocus}
          onKeyDown={alEnter && ((e) => { if (e.key === 'Enter') { e.preventDefault(); alEnter() } })} />
      </div>
    </div>
  )
}

type Hecho = { texto: string; id?: string }

/** Anotar: el monto y tocar la categoría. Tipo, fecha, moneda y detalle son opcionales. */
function Anotar({ acciones, enLinea }: { acciones: AccionesBilletera; enLinea: boolean }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<Tipo>('gasto')
  const [montoTxt, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [moneda, setMoneda] = useState('HNL')
  const [descripcion, setDescripcion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)

  async function guardar(categoria: Categoria) {
    const monto = leerMonto(montoTxt)
    if (!monto) {
      setMensaje(MONTO_INVALIDO)
      campo.current?.focus()
      return
    }
    setEnviando(true)
    setMensaje(null)
    setHecho(null)
    const r = await acciones.agregar({ fecha: fecha || hoyEnElCelular(), tipo, monto, moneda, categoria, descripcion: descripcion.trim() || null })
    setEnviando(false)
    if ('mensaje' in r) {
      setMensaje(r.mensaje)
      return
    }
    setHecho({ texto: `${TIPOS[tipo]} anotado: ${dinero(monto, moneda)} en ${CATEGORIAS[categoria]}.`, id: r.id })
    // La fecha y la moneda se quedan (sirve para anotar varios de ayer); se ven en el resumen de "Fecha, moneda y detalle".
    setMonto('')
    setDescripcion('')
    setTipo('gasto')
    campo.current?.focus()
  }

  async function deshacer(movimiento: string) {
    setEnviando(true)
    const error = await acciones.borrar(movimiento)
    setEnviando(false)
    if (error) setMensaje(error)
    else setHecho({ texto: 'Listo, se quitó.' })
  }

  /** Enter en el monto: falta la categoría, que es la que guarda. */
  function pedirCategoria() {
    setMensaje(leerMonto(montoTxt) ? 'Toca una categoría para guardarlo.' : MONTO_INVALIDO)
  }

  const marcas = [
    fecha ? cuandoFue(fecha) : null,
    moneda !== 'HNL' ? `en ${(MONEDAS[moneda] ?? moneda).toLowerCase()}` : null,
    descripcion.trim() ? 'con detalle' : null,
  ].filter(Boolean)

  return (
    // Sin botón de enviar: cada categoría guarda. El formulario agrupa los campos y no se envía solo.
    <form className="anotar" onSubmit={(e) => e.preventDefault()} aria-label="Anotar un movimiento">
      <div className="tipo" role="group" aria-label="Tipo de movimiento">
        {(Object.keys(TIPOS) as Tipo[]).map((t) => (
          <button key={t} type="button" className="btn" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{TIPOS[t]}</button>
        ))}
      </div>
      <CampoMonto id={`${id}-monto`} valor={montoTxt} cambiar={setMonto} moneda={moneda} refCampo={campo} alEnter={pedirCategoria} />
      <fieldset className="chips" disabled={!enLinea || enviando}>
        <legend>{tipo === 'gasto' ? '¿En qué?' : '¿De qué?'} Tocar la categoría lo guarda</legend>
        <div className="chips-grid">
          {LISTA_CATEGORIAS.map((c) => (
            <button key={c} type="button" className="btn chip" onClick={() => guardar(c)}>{CATEGORIAS[c]}</button>
          ))}
        </div>
      </fieldset>
      <details className="mas">
        <summary>Fecha, moneda y detalle{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <div className="fila">
          <CampoFechaPasada id={`${id}-fecha`} valor={fecha} cambiar={setFecha} />
          <div className="campo">
            <label htmlFor={`${id}-moneda`}>Moneda</label>
            <select id={`${id}-moneda`} value={moneda} onChange={(e) => setMoneda(e.target.value)}><Opciones opciones={MONEDAS} /></select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-detalle`}>Detalle</label>
          <input id={`${id}-detalle`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={LARGO.descripcion}
            autoComplete="off" placeholder="Opcional, como «almuerzo en la U»" />
        </div>
      </details>
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

const porcentaje = (parte: number) => (parte > 0 && parte < 0.005 ? '<1\u00a0%' : `${Math.round(parte * 100)}\u00a0%`)

/** Totales y gastos por categoría de una moneda. La tabla es el gráfico: cada barra lleva su monto y su parte escritos. */
function BloqueMoneda({ r, nombreMes, varias }: { r: ResumenMoneda; nombreMes: string; varias: boolean }) {
  const balance = Math.round(r.ingresos * 100) - Math.round(r.gastos * 100)
  return (
    <div className="bloque-moneda">
      {varias && <h3 className="sub">{MONEDAS[r.moneda] ?? r.moneda}</h3>}
      <dl className="cap">
        <div><dt>Gastos</dt><dd>{dinero(r.gastos, r.moneda)}</dd></div>
        {r.ingresos > 0 && <div><dt>Ingresos</dt><dd>{dinero(r.ingresos, r.moneda)}</dd></div>}
        {r.ingresos > 0 && <div><dt>Balance</dt><dd>{balance < 0 ? '−' : '+'}{dinero(Math.abs(balance) / 100, r.moneda)}</dd></div>}
      </dl>
      {r.categorias.length > 0 && (
        <table className="cats">
          <caption className="sr">Gastos por categoría en {nombreMes}{varias ? `, en ${(MONEDAS[r.moneda] ?? r.moneda).toLowerCase()}` : ''}</caption>
          <thead>
            <tr><th scope="col">Categoría</th><th scope="col">Monto</th><th scope="col">Parte</th></tr>
          </thead>
          <tbody>
            {r.categorias.map((c) => (
              <tr key={c.categoria}>
                <th scope="row">
                  {CATEGORIAS[c.categoria]}
                  {/* SVG y no estilos en línea: la política de contenido de la app no los permite. */}
                  <svg className="barra barra-cat" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <rect className="barra-fondo" width="100" height="4" />
                    <rect className="f1" width={c.parte * 100} height="4" />
                  </svg>
                </th>
                <td>{dinero(c.monto, r.moneda)}</td>
                <td>{porcentaje(c.parte)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Resumen({ lista, mes, meses, cambiarMes }: { lista: Movimiento[]; mes: string; meses: string[]; cambiarMes: (m: string) => void }) {
  const resumen = resumirMes(lista, mes)
  const cantidad = lista.filter((m) => m.fecha.startsWith(mes)).length
  const i = meses.indexOf(mes)
  const nombre = nombreDelMes(mes)
  return (
    <section id="resumen" aria-labelledby="h-resumen">
      <h2 className="sec-h" id="h-resumen">
        <span>{mayuscula(nombre)}</span>
        <span className="c">{cantidad} {cantidad === 1 ? 'movimiento' : 'movimientos'}</span>
      </h2>
      <div className="meses">
        {i > 0 && (
          <button type="button" className="btn btn-q" onClick={() => cambiarMes(meses[i - 1])} aria-label={`Ver ${nombreDelMes(meses[i - 1])}`}>
            <span aria-hidden="true">‹ </span>{mayuscula(nombreDelMes(meses[i - 1]))}
          </button>
        )}
        {i < meses.length - 1 && (
          <button type="button" className="btn btn-q siguiente" onClick={() => cambiarMes(meses[i + 1])} aria-label={`Ver ${nombreDelMes(meses[i + 1])}`}>
            {mayuscula(nombreDelMes(meses[i + 1]))}<span aria-hidden="true"> ›</span>
          </button>
        )}
      </div>
      {resumen.length
        ? resumen.map((r) => <BloqueMoneda key={r.moneda} r={r} nombreMes={nombre} varias={resumen.length > 1} />)
        : <p className="quiet">Nada anotado en {nombre}.</p>}
    </section>
  )
}

function EditorMovimiento({ m, acciones, cerrar }: { m: Movimiento; acciones: AccionesBilletera; cerrar: () => void }) {
  const id = useId()
  const [tipo, setTipo] = useState<Tipo>(m.tipo)
  const [montoTxt, setMonto] = useState(m.monto.toFixed(2))
  const [moneda, setMoneda] = useState(m.moneda)
  const [categoria, setCategoria] = useState<Categoria>(m.categoria)
  const [fecha, setFecha] = useState(m.fecha)
  const [descripcion, setDescripcion] = useState(m.descripcion ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    const monto = leerMonto(montoTxt)
    if (!monto) {
      setMensaje(MONTO_INVALIDO)
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(m, { tipo, monto, moneda, categoria, fecha: fecha || m.fecha, descripcion: descripcion.trim() || null })
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
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${m.descripcion ?? CATEGORIAS[m.categoria]}`}>
      <div className="fila">
        <CampoMonto id={`${id}-monto`} valor={montoTxt} cambiar={setMonto} moneda={moneda} autoFocus />
        <div className="campo">
          <label htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}><Opciones opciones={TIPOS} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-categoria`}>Categoría</label>
          <select id={`${id}-categoria`} value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}><Opciones opciones={CATEGORIAS} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-moneda`}>Moneda</label>
          <select id={`${id}-moneda`} value={moneda} onChange={(e) => setMoneda(e.target.value)}><Opciones opciones={monedasPara(m.moneda)} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-fecha`}>Fecha</label>
          <input id={`${id}-fecha`} type="date" value={fecha} required onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-detalle`}>Detalle</label>
        <input id={`${id}-detalle`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={LARGO.descripcion} autoComplete="off" />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar este movimiento?</span>
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

function FilaMovimiento({ m, enLinea, acciones }: { m: Movimiento; enLinea: boolean; acciones: AccionesBilletera }) {
  const [editando, setEditando] = useState(false)
  if (editando) {
    return <li className="mov editando"><EditorMovimiento m={m} acciones={acciones} cerrar={() => setEditando(false)} /></li>
  }
  const titulo = m.descripcion ?? CATEGORIAS[m.categoria]
  return (
    <li className={`mov ${m.tipo}`}>
      <div className="mov-cuerpo">
        <p className="mov-t">{titulo}</p>
        {m.descripcion && <p className="meta">{CATEGORIAS[m.categoria]}</p>}
      </div>
      <p className="mov-m">
        <span className="sr">{TIPOS[m.tipo]}: </span>
        <span aria-hidden="true">{m.tipo === 'gasto' ? '−' : '+'}</span>{dinero(m.monto, m.moneda)}
      </p>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea}
        aria-label={`Editar: ${titulo}, ${dinero(m.monto, m.moneda)}`}>
        Editar
      </button>
    </li>
  )
}

function Movimientos({ lista, mes, enLinea, acciones }: { lista: Movimiento[]; mes: string; enLinea: boolean; acciones: AccionesBilletera }) {
  const dias = porDia(lista, mes)
  if (!dias.length) return null
  return (
    <section id="movimientos" aria-labelledby="h-movimientos">
      <h2 className="sec-h" id="h-movimientos"><span>Movimientos de {nombreDelMes(mes)}</span></h2>
      {dias.map((d) => (
        <div key={d.fecha} className="dia">
          <h3 className="sub">{cuandoFue(d.fecha)}</h3>
          <ul className="pend-lista">
            {d.movimientos.map((m) => <FilaMovimiento key={m.id} m={m} enLinea={enLinea} acciones={acciones} />)}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function PantallaBilletera({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesBilletera
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const hoy = hoyEnElCelular()
  const meses = mesesVisibles(hoy)
  const actual = meses[meses.length - 1]
  const [elegido, setElegido] = useState(actual)
  // Si la app queda abierta al cambiar de mes, el mes elegido puede quedar fuera de los visibles.
  const mes = meses.includes(elegido) ? elegido : actual

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Billetera" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Billetera' : 'No se pudo cargar tu billetera'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus movimientos…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu billetera por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const gastado = totalEnPalabras(resumirMes(estado.lista, actual), 'gastos')

  return (
    <Marco nombre="Billetera" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar la billetera. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{gastado ? `${gastado} gastados en ${nombreDelMes(actual)}` : `Nada gastado en ${nombreDelMes(actual)}`}</h1>
      <Anotar acciones={acciones} enLinea={enLinea} />
      <Resumen lista={estado.lista} mes={mes} meses={meses} cambiarMes={setElegido} />
      <Movimientos lista={estado.lista} mes={mes} enLinea={enLinea} acciones={acciones} />
    </Marco>
  )
}
