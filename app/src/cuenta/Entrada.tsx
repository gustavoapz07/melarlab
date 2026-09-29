// Pantallas de cuenta: entrar, crear cuenta, recuperar la contraseña y elegir una nueva.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Marca } from '../mi-dia/MiDia.tsx'
import { Instalar } from '../pwa/Instalar.tsx'
import { mensajeDeError, mensajeDelEnlace } from './mensajes.ts'
import { errorDelEnlace, supabase } from './supabase.ts'

type Modo = 'entrar' | 'crear' | 'recuperar'

const TEXTOS: Record<Modo, { titulo: string; bajada: string; boton: string; enviando: string }> = {
  entrar: { titulo: 'Entra a MelarLab', bajada: 'Con tu correo y tu contraseña.', boton: 'Entrar', enviando: 'Entrando…' },
  crear: { titulo: 'Crea tu cuenta', bajada: 'Te enviaremos un correo para confirmarla.', boton: 'Crear cuenta', enviando: 'Creando…' },
  recuperar: { titulo: 'Recupera tu contraseña', bajada: 'Te enviaremos un enlace para crear una nueva.', boton: 'Enviar enlace', enviando: 'Enviando…' },
}

const MINIMO = 8
/** A dónde vuelve el enlace del correo. Tiene que estar en la lista de Supabase (Authentication → URL Configuration). */
const regreso = () => `${window.location.origin}/`

function Pantalla({ titulo, bajada, enLinea, tituloRef, children }: {
  titulo: string
  bajada: string
  enLinea: boolean
  tituloRef?: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  return (
    <div className="wrap">
      <header className="mast">
        <span className="brand"><Marca />MelarLab</span>
        <span className="date">Vida con ventaja</span>
      </header>
      <main className="entrada">
        {!enLinea && <p className="aviso aviso-fuerte">Sin conexión. Para entrar hace falta internet.</p>}
        <Instalar />
        <h1 ref={tituloRef} tabIndex={-1}>{titulo}</h1>
        <p className="bajada">{bajada}</p>
        {children}
      </main>
    </div>
  )
}

function CampoContrasena({ valor, cambiar, nueva }: { valor: string; cambiar: (v: string) => void; nueva: boolean }) {
  const id = useId()
  const [ver, setVer] = useState(false)
  return (
    <div className="campo">
      <label htmlFor={id}>{nueva ? 'Contraseña nueva' : 'Contraseña'}</label>
      <div className="con-boton">
        <input id={id} type={ver ? 'text' : 'password'} value={valor} onChange={(e) => cambiar(e.target.value)} required
          minLength={nueva ? MINIMO : undefined} autoComplete={nueva ? 'new-password' : 'current-password'}
          aria-describedby={nueva ? `${id}-ayuda` : undefined} />
        <button type="button" className="btn btn-q" aria-pressed={ver} aria-label="Mostrar contraseña" onClick={() => setVer((v) => !v)}>
          Mostrar
        </button>
      </div>
      {nueva && <p className="ayuda" id={`${id}-ayuda`}>Al menos {MINIMO} caracteres.</p>}
    </div>
  )
}

function Mensajes({ error, listo }: { error: string | null; listo: string | null }) {
  return (
    <>
      {error && <p className="alerta" role="alert">{error}</p>}
      {listo && <p className="listo" role="status">{listo}</p>}
    </>
  )
}

export function Entrada({ enLinea }: { enLinea: boolean }) {
  const idCorreo = useId()
  const [modo, setModo] = useState<Modo>('entrar')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(() => (errorDelEnlace ? mensajeDelEnlace(errorDelEnlace) : null))
  const [listo, setListo] = useState<string | null>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const primera = useRef(true)

  // Al cambiar de pantalla, el foco va al título para que los lectores de pantalla lo anuncien.
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    titulo.current?.focus()
  }, [modo])

  const cambiar = (m: Modo) => {
    setModo(m)
    setError(null)
    setListo(null)
    setContrasena('')
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setListo(null)
    const email = correo.trim()
    if (modo === 'crear' && contrasena.length < MINIMO) {
      setError(`La contraseña necesita al menos ${MINIMO} caracteres.`)
      return
    }
    setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: contrasena })
        if (error) setError(mensajeDeError(error))
      } else if (modo === 'crear') {
        const { data, error } = await supabase.auth.signUp({ email, password: contrasena, options: { emailRedirectTo: regreso() } })
        if (error) setError(mensajeDeError(error))
        else if (!data.session) {
          // Si el correo ya tenía cuenta, Supabase responde igual: así no se revela quién está registrado.
          setListo(`Te enviamos un correo a ${email}. Abre el enlace para confirmar tu cuenta y después entra aquí.`)
          setContrasena('')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: regreso() })
        if (error) setError(mensajeDeError(error))
        else setListo('Si hay una cuenta con ese correo, te llegó un enlace para crear una contraseña nueva.')
      }
    } catch (err) {
      setError(mensajeDeError(err as Error))
    } finally {
      setEnviando(false)
    }
  }

  const t = TEXTOS[modo]
  return (
    <Pantalla titulo={t.titulo} bajada={t.bajada} enLinea={enLinea} tituloRef={titulo}>
      <form className="form" onSubmit={enviar}>
        <div className="campo">
          <label htmlFor={idCorreo}>Correo</label>
          <input id={idCorreo} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required
            autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
        </div>
        {modo !== 'recuperar' && <CampoContrasena valor={contrasena} cambiar={setContrasena} nueva={modo === 'crear'} />}
        <Mensajes error={error} listo={listo} />
        <button type="submit" className="btn btn-p" disabled={enviando}>{enviando ? t.enviando : t.boton}</button>
      </form>
      <nav className="otros" aria-label="Otras opciones">
        {modo !== 'entrar' && <button type="button" className="btn btn-q" onClick={() => cambiar('entrar')}>Ya tengo cuenta</button>}
        {modo !== 'crear' && <button type="button" className="btn btn-q" onClick={() => cambiar('crear')}>Crear una cuenta</button>}
        {modo !== 'recuperar' && <button type="button" className="btn btn-q" onClick={() => cambiar('recuperar')}>Olvidé mi contraseña</button>}
      </nav>
    </Pantalla>
  )
}

/** Después de abrir el enlace de "recuperar contraseña". */
export function NuevaContrasena({ correo, enLinea, cancelar }: { correo?: string; enLinea: boolean; cancelar: () => void }) {
  const [contrasena, setContrasena] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (contrasena.length < MINIMO) {
      setError(`La contraseña necesita al menos ${MINIMO} caracteres.`)
      return
    }
    setEnviando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: contrasena })
      if (error) setError(mensajeDeError(error))
    } catch (err) {
      setError(mensajeDeError(err as Error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Pantalla titulo="Crea una contraseña nueva" bajada={correo ? `Para ${correo}.` : 'Para tu cuenta.'} enLinea={enLinea}>
      <form className="form" onSubmit={guardar}>
        {/* Campo oculto para que el gestor de contraseñas sepa de qué cuenta es la nueva. */}
        {correo && <input type="email" value={correo} autoComplete="username" readOnly hidden />}
        <CampoContrasena valor={contrasena} cambiar={setContrasena} nueva />
        <Mensajes error={error} listo={null} />
        <button type="submit" className="btn btn-p" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
      <nav className="otros" aria-label="Otras opciones">
        <button type="button" className="btn btn-q" onClick={cancelar}>Cancelar</button>
      </nav>
    </Pantalla>
  )
}
