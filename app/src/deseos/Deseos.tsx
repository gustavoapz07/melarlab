// Pantalla Lista de deseos: lo que quiero comprar, con su precio y el precio al que lo compraría. Lo que
// llegó a ese precio va arriba. Marcarlo como comprado ofrece anotarlo como gasto en la Billetera, y si en
// la Billetera hay ingresos del mes, dice qué alcanza con lo que sobra.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { NuevoMovimiento } from '../billetera/useBilletera.ts'
import { MONEDAS, dinero, leerMonto, simbolo } from '../dinero.ts'
import { Opciones } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { fechaCorta, hoyEnElCelular } from '../mi-dia/formato.ts'
import {
  ESTADOS, LARGO, PRIORIDADES, agrupar, dominio, leerEnlace, totales,
  type CambiosDeseo, type Deseo, type EstadoDeseos, type NuevoDeseo, type Prioridad, type EstadoDeseo,
} from './useDeseos.ts'

export interface AccionesDeseos {
  estado: EstadoDeseos
  agregar: (nuevo: NuevoDeseo) => Promise<string | null>
  cambiar: (original: Deseo, cambios: CambiosDeseo) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

/** Lo que la pantalla usa de la Billetera: lo que sobra este mes por moneda y anotar un gasto. */
export interface DesdeBilletera {
  sobra: Record<string, number>
  anotarGasto: (gasto: NuevoMovimiento) => Promise<{ id: string } | { mensaje: string }>
}

const PRECIO_INVALIDO = 'El precio va como 1500 o 1,500.50, mayor que 0.'
const ENLACE_INVALIDO = 'El enlace tiene que empezar con https://'

/** Lee un precio opcional: vacío es null; si no sirve, NaN. */
function leerPrecio(texto: string): number | null {
  if (!texto.trim()) return null
  return leerMonto(texto) ?? NaN
}

/** Precio hoy, precio que pagaría, moneda, enlace y prioridad: lo mismo al agregar y al editar. */
function CamposDelProducto({ id, v, cambiar, enfocarPrecio }: {
  id: string
  enfocarPrecio?: boolean
  v: { precio: string; objetivo: string; moneda: string; enlace: string; prioridad: Prioridad }
  cambiar: (c: Partial<{ precio: string; objetivo: string; moneda: string; enlace: string; prioridad: Prioridad }>) => void
}) {
  return (
    <>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-precio`}>Precio hoy</label>
          <div className="monto monto-chico">
            <span className="monto-moneda" aria-hidden="true">{simbolo(v.moneda)}</span>
            <input id={`${id}-precio`} inputMode="decimal" autoComplete="off" autoFocus={enfocarPrecio} value={v.precio} onChange={(e) => cambiar({ precio: e.target.value })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-objetivo`}>Lo compraría a</label>
          <div className="monto monto-chico">
            <span className="monto-moneda" aria-hidden="true">{simbolo(v.moneda)}</span>
            <input id={`${id}-objetivo`} inputMode="decimal" autoComplete="off" value={v.objetivo} onChange={(e) => cambiar({ objetivo: e.target.value })} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-moneda`}>Moneda</label>
          <select id={`${id}-moneda`} value={v.moneda} onChange={(e) => cambiar({ moneda: e.target.value })}>
            <Opciones opciones={v.moneda in MONEDAS ? MONEDAS : { ...MONEDAS, [v.moneda]: v.moneda }} />
          </select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-prioridad`}>Prioridad</label>
          <select id={`${id}-prioridad`} value={v.prioridad} onChange={(e) => cambiar({ prioridad: e.target.value as Prioridad })}>
            <Opciones opciones={PRIORIDADES} />
          </select>
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-enlace`}>Enlace de la tienda</label>
        <input id={`${id}-enlace`} type="url" inputMode="url" autoComplete="off" placeholder="https://" value={v.enlace}
          onChange={(e) => cambiar({ enlace: e.target.value })} maxLength={LARGO.enlace} />
      </div>
    </>
  )
}

/** Revisa los campos del producto y los convierte; devuelve un mensaje si algo no sirve. */
function convertir(v: { precio: string; objetivo: string; enlace: string }): { precio: number | null; objetivo: number | null; enlace: string | null } | string {
  const precio = leerPrecio(v.precio)
  const objetivo = leerPrecio(v.objetivo)
  const enlace = leerEnlace(v.enlace)
  if (Number.isNaN(precio) || Number.isNaN(objetivo)) return PRECIO_INVALIDO
  if (enlace === undefined) return ENLACE_INVALIDO
  return { precio, objetivo, enlace }
}

const VACIO = { precio: '', objetivo: '', moneda: 'HNL', enlace: '', prioridad: 'media' as Prioridad }

function Agregar({ acciones, enLinea }: { acciones: AccionesDeseos; enLinea: boolean }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [producto, setProducto] = useState('')
  const [v, setV] = useState(VACIO)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const p = producto.trim()
    if (!p || enviando) return
    const c = convertir(v)
    if (typeof c === 'string') {
      setMensaje(c)
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.agregar({ producto: p, precio: c.precio, precio_objetivo: c.objetivo, moneda: v.moneda, enlace: c.enlace, prioridad: v.prioridad, notas: null })
    setEnviando(false)
    if (error) {
      setMensaje(error)
      return
    }
    // La moneda se queda: suele tocar agregar varias cosas de la misma tienda.
    setProducto('')
    setV((x) => ({ ...VACIO, moneda: x.moneda }))
    campo.current?.focus()
  }

  const marcas = [v.precio.trim() ? `${simbolo(v.moneda)} ${v.precio.trim()}` : null, v.enlace.trim() ? 'con enlace' : null,
    v.prioridad !== 'media' ? `prioridad ${PRIORIDADES[v.prioridad].toLowerCase()}` : null].filter(Boolean)

  return (
    <form className="agregar" onSubmit={enviar} aria-label="Agregar a la lista">
      <div className="campo">
        <label htmlFor={id}>¿Qué quieres comprar?</label>
        <div className="con-boton">
          <input ref={campo} id={id} value={producto} onChange={(e) => setProducto(e.target.value)} required maxLength={LARGO.producto}
            autoComplete="off" enterKeyHint="done" disabled={!enLinea} />
          <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Agregando…' : 'Agregar'}</button>
        </div>
      </div>
      <details className="mas">
        <summary>Precio, enlace y prioridad{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <CamposDelProducto id={id} v={v} cambiar={(c) => setV((x) => ({ ...x, ...c }))} />
      </details>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </form>
  )
}

function Editor({ d, acciones, cerrar }: { d: Deseo; acciones: AccionesDeseos; cerrar: () => void }) {
  const id = useId()
  const [producto, setProducto] = useState(d.producto)
  const [v, setV] = useState({
    precio: d.precio === null ? '' : d.precio.toFixed(2), objetivo: d.precio_objetivo === null ? '' : d.precio_objetivo.toFixed(2),
    moneda: d.moneda, enlace: d.enlace ?? '', prioridad: d.prioridad,
  })
  const [estado, setEstado] = useState<EstadoDeseo>(d.estado)
  const [notas, setNotas] = useState(d.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const p = producto.trim()
    if (!p || enviando) return
    const c = convertir(v)
    if (typeof c === 'string') {
      setMensaje(c)
      return
    }
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(d, {
      producto: p, precio: c.precio, precio_objetivo: c.objetivo, moneda: v.moneda, enlace: c.enlace, prioridad: v.prioridad, estado, notas: notas.trim() || null,
    })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(d.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${d.producto}`}>
      <div className="campo">
        <label htmlFor={`${id}-producto`}>Producto</label>
        <input id={`${id}-producto`} value={producto} onChange={(e) => setProducto(e.target.value)} required maxLength={LARGO.producto} autoComplete="off" />
      </div>
      {/* El foco va al precio: es lo que más se cambia. */}
      <CamposDelProducto id={id} v={v} cambiar={(c) => setV((x) => ({ ...x, ...c }))} enfocarPrecio />
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-estado`}>Estado</label>
          <select id={`${id}-estado`} value={estado} onChange={(e) => setEstado(e.target.value as EstadoDeseo)}><Opciones opciones={ESTADOS} /></select>
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
            <span>¿Borrarlo de la lista?</span>
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

type Aviso = { texto: string; comprado?: Deseo } | { texto: string; error: true }

function Fila({ d, enLinea, acciones, sobra, avisar }: {
  d: Deseo
  enLinea: boolean
  acciones: AccionesDeseos
  sobra: Record<string, number>
  /** El aviso va arriba de la lista: al marcarlo como comprado, la fila cambia de grupo. */
  avisar: (a: Aviso | null) => void
}) {
  const id = useId()
  const [editando, setEditando] = useState(false)
  const comprado = d.estado === 'comprado'
  if (editando) return <li className="pend editando"><Editor d={d} acciones={acciones} cerrar={() => setEditando(false)} /></li>

  async function alternar() {
    avisar(null)
    const error = await acciones.cambiar(d, { estado: comprado ? 'quiero' : 'comprado' })
    if (error) avisar({ texto: `${error} ("${d.producto}" quedó como estaba.)`, error: true })
    else if (!comprado) avisar({ texto: `${d.producto}: comprado.`, comprado: d })
  }

  const alcanza = d.estado === 'quiero' && d.precio !== null && (sobra[d.moneda] ?? 0) >= d.precio
  const meta = [
    d.precio !== null ? dinero(d.precio, d.moneda) : 'Sin precio',
    d.precio_objetivo !== null ? `lo comprarías a ${dinero(d.precio_objetivo, d.moneda)}` : null,
    d.prioridad === 'alta' ? 'Prioridad alta' : null,
    alcanza ? 'Te alcanza con lo que sobra este mes' : null,
  ].filter(Boolean)

  return (
    <li className={comprado ? 'pend hecho' : 'pend'}>
      <input type="checkbox" id={id} checked={comprado} onChange={alternar} disabled={!enLinea || d.estado === 'descartado'}
        aria-describedby={`${id}-meta`} />
      <div className="pend-cuerpo">
        <label htmlFor={id} className="pend-t">{d.producto}</label>
        <p className="meta" id={`${id}-meta`}>{comprado && <span className="sr">Comprado. </span>}{meta.join(' · ')}</p>
        {d.enlace && (
          <p className="enlace-tienda">
            <a href={d.enlace} target="_blank" rel="noopener noreferrer">Ver en {dominio(d.enlace)}<span className="sr"> (se abre aparte)</span></a>
          </p>
        )}
        {d.notas && <p className="x">{d.notas}</p>}
      </div>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea} aria-label={`Editar: ${d.producto}`}>Editar</button>
    </li>
  )
}

function Grupo({ id, titulo, lista, children }: { id: string; titulo: string; lista: Deseo[]; children: (d: Deseo) => ReactNode }) {
  if (!lista.length) return null
  return (
    <section id={id} aria-labelledby={`h-${id}`}>
      <h2 className="sec-h" id={`h-${id}`}><span>{titulo}</span><span className="c">{lista.length}</span></h2>
      <ul className="pend-lista">{lista.map(children)}</ul>
    </section>
  )
}

export function PantallaDeseos({ acciones, billetera, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesDeseos
  billetera: DesdeBilletera
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  avisos: ReactNode
}) {
  const { estado } = acciones
  const hoy = hoyEnElCelular()
  const [aviso, avisar] = useState<Aviso | null>(null)
  const [anotando, setAnotando] = useState(false)

  if (estado.tipo !== 'listo') {
    return (
      <Marco nombre="Lista de deseos" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Lista de deseos' : 'No se pudo cargar tu lista de deseos'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tu lista…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tu lista por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const g = agrupar(estado.lista)
  const quiero = g.aSuPrecio.length + g.quiero.length
  const titulo = g.aSuPrecio.length === 1 ? `${g.aSuPrecio[0].producto} llegó a tu precio`
    : g.aSuPrecio.length > 1 ? `${g.aSuPrecio.length} cosas llegaron a tu precio`
      : quiero ? `${quiero} ${quiero === 1 ? 'cosa' : 'cosas'} en tu lista` : 'Tu lista de deseos está vacía'
  const fila = (d: Deseo) => <Fila key={d.id} d={d} enLinea={enLinea} acciones={acciones} sobra={billetera.sobra} avisar={avisar} />
  // Solo las monedas donde algo tiene precio: con todo sin precio, "L 0.00" confundiría.
  const cuentas = totales(estado.lista).filter((t) => t.hoy > 0)

  /** Anota en la Billetera el gasto de lo que se acaba de comprar: un toque. */
  async function anotarGasto(d: Deseo) {
    if (d.precio === null) return
    setAnotando(true)
    const r = await billetera.anotarGasto({ fecha: hoy, tipo: 'gasto', monto: d.precio, moneda: d.moneda, categoria: 'compras', descripcion: d.producto })
    setAnotando(false)
    avisar('mensaje' in r ? { texto: r.mensaje, error: true } : { texto: `Gasto anotado en la Billetera: ${dinero(d.precio, d.moneda)} en Compras.` })
  }

  return (
    <Marco nombre="Lista de deseos" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudo actualizar la lista. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{titulo}</h1>
      <Agregar acciones={acciones} enLinea={enLinea} />
      {cuentas.map((t) => (
        <dl className="cap totales" key={t.moneda}>
          <div><dt>Todo, al precio de hoy</dt><dd>{dinero(t.hoy, t.moneda)}</dd></div>
          <div><dt>Al precio que quieres</dt><dd>{dinero(t.objetivo, t.moneda)}</dd></div>
          {(billetera.sobra[t.moneda] ?? 0) > 0 && <div><dt>Te sobra este mes</dt><dd>{dinero(billetera.sobra[t.moneda], t.moneda)}</dd></div>}
          {t.sinPrecio > 0 && <div><dt>Sin precio</dt><dd>{t.sinPrecio}</dd></div>}
        </dl>
      ))}
      {aviso && ('error' in aviso ? <p className="alerta" role="alert">{aviso.texto}</p> : (
        <p className="aviso aviso-fuerte" role="status">
          {aviso.texto}
          {aviso.comprado && aviso.comprado.precio !== null && (
            <span className="acc">
              <button type="button" className="btn btn-q" disabled={!enLinea || anotando} onClick={() => aviso.comprado && anotarGasto(aviso.comprado)}>
                Anotar el gasto ({dinero(aviso.comprado.precio, aviso.comprado.moneda)})
              </button>
            </span>
          )}
        </p>
      ))}
      <Grupo id="a-su-precio" titulo="Llegaron a tu precio" lista={g.aSuPrecio}>{fila}</Grupo>
      <Grupo id="quiero" titulo="Lo que quiero" lista={g.quiero}>{fila}</Grupo>
      {(g.comprados.length > 0 || g.descartados.length > 0) && (
        <section id="pasados" aria-labelledby="h-pasados">
          <h2 className="sec-h" id="h-pasados"><span>Comprado y descartado</span><span className="c">{g.comprados.length + g.descartados.length}</span></h2>
          <details className="mas">
            <summary>Ver lo comprado y lo descartado</summary>
            <ul className="pend-lista">{[...g.comprados, ...g.descartados].map(fila)}</ul>
          </details>
        </section>
      )}
    </Marco>
  )
}

