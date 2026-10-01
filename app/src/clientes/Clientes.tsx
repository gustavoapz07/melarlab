// Pantalla Clientes: el mini CRM. A quién toca escribirle hoy va arriba; el resto, por etapa del embudo.
// "Contacté hoy" anota el contacto en un toque: pasa el prospecto a contactado y propone el siguiente
// seguimiento en una semana, con Deshacer.
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Opciones } from '../formularios.tsx'
import { Marco } from '../Marco.tsx'
import { cuandoFue, fechaCorta, hoyEnElCelular, sumarDiasISO } from '../mi-dia/formato.ts'
import {
  DIAS_PARA_SEGUIR, ETAPAS, LARGO, agrupar, seguimiento,
  type CambiosCliente, type Cliente, type EstadoClientes, type Etapa, type NuevoCliente,
} from './useClientes.ts'

export interface AccionesClientes {
  estado: EstadoClientes
  agregar: (nuevo: NuevoCliente) => Promise<string | null>
  cambiar: (original: Cliente, cambios: CambiosCliente) => Promise<string | null>
  borrar: (id: string) => Promise<string | null>
  recargar: () => void
}

/** Fecha del próximo seguimiento, con atajos para hoy, mañana y en una semana. Vacío es sin seguimiento. */
function CampoSeguimiento({ id, valor, cambiar }: { id: string; valor: string; cambiar: (v: string) => void }) {
  const hoy = hoyEnElCelular()
  const atajos: [string, string][] = [['Hoy', hoy], ['Mañana', sumarDiasISO(hoy, 1)], ['En una semana', sumarDiasISO(hoy, DIAS_PARA_SEGUIR)]]
  return (
    <div className="campo">
      <label htmlFor={id}>Próximo seguimiento</label>
      <input id={id} type="date" value={valor} onChange={(e) => cambiar(e.target.value)} />
      <div className="atajos">
        {atajos.map(([nombre, fecha]) => (
          <button key={nombre} type="button" className="btn btn-q" aria-pressed={valor === fecha} onClick={() => cambiar(fecha)}>{nombre}</button>
        ))}
        {valor && <button type="button" className="btn btn-q" onClick={() => cambiar('')}>Sin fecha</button>}
      </div>
    </div>
  )
}

function Agregar({ acciones, enLinea }: { acciones: AccionesClientes; enLinea: boolean }) {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const [negocio, setNegocio] = useState('')
  const [contacto, setContacto] = useState('')
  const [rubro, setRubro] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('prospecto')
  const [seguimiento, setSeguimiento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const n = negocio.trim()
    if (!n || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.agregar({
      negocio: n, contacto: contacto.trim() || null, rubro: rubro.trim() || null, estado: etapa, proximo_seguimiento: seguimiento || null,
    })
    setEnviando(false)
    if (error) {
      setMensaje(error)
      return
    }
    // El rubro y la etapa se quedan: suele tocar agregar varios negocios parecidos seguidos.
    setNegocio('')
    setContacto('')
    setSeguimiento('')
    campo.current?.focus()
  }

  const marcas = [contacto.trim() ? 'con contacto' : null, rubro.trim() || null, etapa !== 'prospecto' ? ETAPAS[etapa].toLowerCase() : null,
    seguimiento ? `seguimiento: ${cuandoFue(seguimiento).toLowerCase()}` : null].filter(Boolean)

  return (
    <form className="agregar" onSubmit={enviar} aria-label="Agregar un negocio">
      <div className="campo">
        <label htmlFor={id}>Negocio nuevo</label>
        <div className="con-boton">
          <input ref={campo} id={id} value={negocio} onChange={(e) => setNegocio(e.target.value)} required maxLength={LARGO.negocio}
            autoComplete="off" enterKeyHint="done" disabled={!enLinea} />
          <button type="submit" className="btn btn-lleno" disabled={!enLinea || enviando}>{enviando ? 'Agregando…' : 'Agregar'}</button>
        </div>
      </div>
      <details className="mas">
        <summary>Contacto, rubro, etapa y seguimiento{marcas.length > 0 && <span className="marcas"> · {marcas.join(' · ')}</span>}</summary>
        <div className="fila">
          <div className="campo">
            <label htmlFor={`${id}-contacto`}>Contacto</label>
            <input id={`${id}-contacto`} value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={LARGO.contacto} autoComplete="off"
              placeholder="Con quién hablo" />
          </div>
          <div className="campo">
            <label htmlFor={`${id}-rubro`}>Rubro</label>
            <input id={`${id}-rubro`} value={rubro} onChange={(e) => setRubro(e.target.value)} maxLength={LARGO.rubro} autoComplete="off"
              placeholder="Como «panadería»" />
          </div>
          <div className="campo">
            <label htmlFor={`${id}-etapa`}>Etapa</label>
            <select id={`${id}-etapa`} value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}><Opciones opciones={ETAPAS} /></select>
          </div>
        </div>
        <CampoSeguimiento id={`${id}-seguimiento`} valor={seguimiento} cambiar={setSeguimiento} />
      </details>
      {mensaje && <p className="alerta" role="alert">{mensaje}</p>}
    </form>
  )
}

function Editor({ c, acciones, cerrar }: { c: Cliente; acciones: AccionesClientes; cerrar: () => void }) {
  const id = useId()
  const [negocio, setNegocio] = useState(c.negocio)
  const [contacto, setContacto] = useState(c.contacto ?? '')
  const [rubro, setRubro] = useState(c.rubro ?? '')
  const [etapa, setEtapa] = useState<Etapa>(c.estado)
  const [ultimo, setUltimo] = useState(c.ultimo_contacto ?? '')
  const [seguimiento, setSeguimiento] = useState(c.proximo_seguimiento ?? '')
  const [notas, setNotas] = useState(c.notas ?? '')
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const n = negocio.trim()
    if (!n || enviando) return
    setEnviando(true)
    setMensaje(null)
    const error = await acciones.cambiar(c, {
      negocio: n, contacto: contacto.trim() || null, rubro: rubro.trim() || null, estado: etapa,
      ultimo_contacto: ultimo || null, proximo_seguimiento: seguimiento || null, notas: notas.trim() || null,
    })
    setEnviando(false)
    if (error) setMensaje(error)
    else cerrar()
  }

  async function eliminar() {
    setEnviando(true)
    const error = await acciones.borrar(c.id)
    // Si salió bien, la fila desaparece de la lista y este formulario con ella.
    if (error) {
      setEnviando(false)
      setMensaje(error)
    }
  }

  return (
    <form className="editor" onSubmit={guardar} aria-label={`Editar: ${c.negocio}`}>
      <div className="campo">
        <label htmlFor={`${id}-negocio`}>Negocio</label>
        {/* El foco va al campo que se acaba de abrir. */}
        <input id={`${id}-negocio`} value={negocio} onChange={(e) => setNegocio(e.target.value)} required maxLength={LARGO.negocio} autoComplete="off" autoFocus />
      </div>
      <div className="fila">
        <div className="campo">
          <label htmlFor={`${id}-contacto`}>Contacto</label>
          <input id={`${id}-contacto`} value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={LARGO.contacto} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-rubro`}>Rubro</label>
          <input id={`${id}-rubro`} value={rubro} onChange={(e) => setRubro(e.target.value)} maxLength={LARGO.rubro} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-etapa`}>Etapa</label>
          <select id={`${id}-etapa`} value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}><Opciones opciones={ETAPAS} /></select>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-ultimo`}>Último contacto</label>
          <input id={`${id}-ultimo`} type="date" value={ultimo} max={hoyEnElCelular()} onChange={(e) => setUltimo(e.target.value)} />
        </div>
      </div>
      <CampoSeguimiento id={`${id}-seguimiento`} valor={seguimiento} cambiar={setSeguimiento} />
      <div className="campo">
        <label htmlFor={`${id}-notas`}>Notas</label>
        <textarea id={`${id}-notas`} value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={LARGO.notas} rows={3} />
      </div>
      <div className="acciones">
        <button type="submit" className="btn btn-lleno" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-q" onClick={cerrar}>Cancelar</button>
        {confirmar ? (
          <span className="confirmar">
            <span>¿Borrar este negocio?</span>
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

type Aviso = { texto: string; deshacer?: { antes: CambiosCliente; despues: Cliente } } | { texto: string; error: true }

function Fila({ c, hoy, conEtapa, enLinea, acciones, avisar }: {
  c: Cliente
  hoy: string
  /** En "Toca hoy" se dice la etapa; en las secciones de cada etapa sobra. */
  conEtapa: boolean
  enLinea: boolean
  acciones: AccionesClientes
  avisar: (a: Aviso | null) => void
}) {
  const [editando, setEditando] = useState(false)
  if (editando) return <li className="mov editando"><Editor c={c} acciones={acciones} cerrar={() => setEditando(false)} /></li>

  /** Un toque: contacto de hoy, el prospecto pasa a contactado y el siguiente seguimiento queda en una semana. */
  async function contacteHoy() {
    avisar(null)
    const antes: CambiosCliente = { ultimo_contacto: c.ultimo_contacto, proximo_seguimiento: c.proximo_seguimiento, estado: c.estado }
    const cambios: CambiosCliente = {
      ultimo_contacto: hoy, proximo_seguimiento: sumarDiasISO(hoy, DIAS_PARA_SEGUIR), estado: c.estado === 'prospecto' ? 'contactado' : c.estado,
    }
    const error = await acciones.cambiar(c, cambios)
    if (error) avisar({ texto: `${error} ("${c.negocio}" quedó como estaba.)`, error: true })
    else avisar({
      texto: `${c.negocio}: contacto anotado. Próximo seguimiento: ${cuandoFue(cambios.proximo_seguimiento ?? hoy).toLowerCase()}.`,
      deshacer: { antes, despues: { ...c, ...cambios } },
    })
  }

  const meta = [conEtapa ? ETAPAS[c.estado] : null, c.rubro, c.contacto].filter(Boolean).join(' · ')
  const fechas = [
    c.proximo_seguimiento ? seguimiento(c.proximo_seguimiento, hoy) : null,
    c.ultimo_contacto ? `Último contacto: ${cuandoFue(c.ultimo_contacto, hoy).toLowerCase()}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <li className="mov cliente">
      <div className="mov-cuerpo">
        <p className="mov-t">{c.negocio}</p>
        {meta && <p className="meta">{meta}</p>}
        {fechas && <p className="meta">{fechas}</p>}
        {c.notas && <p className="x">{c.notas}</p>}
        {c.estado !== 'descartado' && (
          <button type="button" className="btn btn-q contacte" onClick={contacteHoy} disabled={!enLinea} aria-label={`Contacté hoy a ${c.negocio}`}>
            Contacté hoy
          </button>
        )}
      </div>
      <button type="button" className="btn btn-q" onClick={() => setEditando(true)} disabled={!enLinea} aria-label={`Editar: ${c.negocio}`}>Editar</button>
    </li>
  )
}

export function PantallaClientes({ acciones, enLinea, nav, cuenta, avisos }: {
  acciones: AccionesClientes
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
      <Marco nombre="Clientes" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
        {avisos}
        <h1 tabIndex={-1}>{estado.tipo === 'cargando' ? 'Clientes' : 'No se pudieron cargar tus clientes'}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>
          {estado.tipo === 'cargando' ? 'Cargando tus clientes…'
            : enLinea ? 'Revisa tu conexión e intenta de nuevo.' : 'Para ver tus clientes por primera vez hace falta internet.'}
        </p>
        {estado.tipo === 'error' && enLinea && <button type="button" className="btn" onClick={acciones.recargar}>Reintentar</button>}
      </Marco>
    )
  }

  const g = agrupar(estado.lista, hoy)
  const activos = estado.lista.filter((c) => c.estado !== 'descartado').length
  const titulo = g.tocaHoy.length === 1 ? `Toca escribirle a ${g.tocaHoy[0].negocio}`
    : g.tocaHoy.length > 1 ? `Toca escribirles a ${g.tocaHoy.length} negocios`
      : activos ? `${activos} ${activos === 1 ? 'negocio' : 'negocios'} en seguimiento` : 'Todavía no hay negocios'
  const fila = (conEtapa: boolean) => (c: Cliente) => (
    <Fila key={c.id} c={c} hoy={hoy} conEtapa={conEtapa} enLinea={enLinea} acciones={acciones} avisar={avisar} />
  )

  async function deshacer(d: { antes: CambiosCliente; despues: Cliente }) {
    avisar(null)
    const error = await acciones.cambiar(d.despues, d.antes)
    avisar(error ? { texto: error, error: true } : { texto: 'Listo, quedó como estaba.' })
  }

  return (
    <Marco nombre="Clientes" fecha={fechaCorta(hoy)} nav={nav} cuenta={cuenta}>
      {avisos}
      {estado.fallo && enLinea && (
        <p className="aviso">
          No se pudieron actualizar tus clientes. Lo que ves es lo último guardado.
          <span className="acc"><button type="button" className="btn btn-q" onClick={acciones.recargar}>Reintentar</button></span>
        </p>
      )}
      <h1 tabIndex={-1}>{titulo}</h1>
      <Agregar acciones={acciones} enLinea={enLinea} />
      {activos > 0 && (
        <dl className="cap embudo">
          {g.etapas.map(({ etapa }) => (
            <div key={etapa}><dt>{ETAPAS[etapa]}</dt><dd>{estado.lista.filter((c) => c.estado === etapa).length}</dd></div>
          ))}
        </dl>
      )}
      {aviso && ('error' in aviso ? <p className="alerta" role="alert">{aviso.texto}</p> : (
        <p className="aviso aviso-fuerte" role="status">
          {aviso.texto}
          {aviso.deshacer && (
            <span className="acc">
              <button type="button" className="btn btn-q" disabled={!enLinea} onClick={() => aviso.deshacer && deshacer(aviso.deshacer)}>Deshacer</button>
            </span>
          )}
        </p>
      ))}
      {g.tocaHoy.length > 0 && (
        <section id="toca-hoy" aria-labelledby="h-toca-hoy">
          <h2 className="sec-h" id="h-toca-hoy"><span>Toca hoy</span><span className="c">{g.tocaHoy.length}</span></h2>
          <ul className="pend-lista">{g.tocaHoy.map(fila(true))}</ul>
        </section>
      )}
      {g.etapas.filter((e) => e.lista.length).map(({ etapa, lista }) => (
        <section key={etapa} id={`etapa-${etapa}`} aria-labelledby={`h-etapa-${etapa}`}>
          <h2 className="sec-h" id={`h-etapa-${etapa}`}><span>{ETAPAS[etapa]}</span><span className="c">{lista.length}</span></h2>
          <ul className="pend-lista">{lista.map(fila(false))}</ul>
        </section>
      ))}
      {g.descartados.length > 0 && (
        <section id="descartados" aria-labelledby="h-descartados">
          <h2 className="sec-h" id="h-descartados"><span>Descartados</span><span className="c">{g.descartados.length}</span></h2>
          <details className="mas">
            <summary>Ver los descartados</summary>
            <ul className="pend-lista">{g.descartados.map(fila(false))}</ul>
          </details>
        </section>
      )}
    </Marco>
  )
}
