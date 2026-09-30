import type { ReactNode } from 'react'
import { Entrada, NuevaContrasena } from './cuenta/Entrada.tsx'
import { configurada } from './cuenta/supabase.ts'
import { useSesion } from './cuenta/useSesion.ts'
import { fechaEnPalabras, hoyEnElCelular } from './mi-dia/formato.ts'
import { Marca, MiDia } from './mi-dia/MiDia.tsx'
import { useMiDia } from './mi-dia/useMiDia.ts'
import { AvisoActualizacion } from './pwa/AvisoActualizacion.tsx'
import { Instalar } from './pwa/Instalar.tsx'
import { useEnLinea } from './pwa/useEnLinea.ts'

function Cabecera() {
  return (
    <div className="wrap">
      <header className="mast"><span className="brand"><Marca />MelarLab</span></header>
    </div>
  )
}

interface PropsMiDia {
  usuario: string
  correo?: string
  /** Aviso de la sesión, como "Contraseña actualizada.". */
  aviso?: string
  enLinea: boolean
  salir: () => void
}

/** Mi Día real, de la tabla mi_dia. Mientras no hay uno, una pantalla corta que explica por qué. */
function PantallaMiDia({ usuario, correo, aviso, enLinea, salir }: PropsMiDia) {
  const { estado, recargar } = useMiDia(usuario)

  const cuenta = (
    <>
      <span className="correo">{correo}</span>
      <button type="button" className="btn btn-q" onClick={salir}>Cerrar sesión</button>
    </>
  )
  const avisos = (extra?: ReactNode) => (
    <>
      {!enLinea && (
        <p className="aviso aviso-fuerte">
          {estado.tipo === 'listo' ? 'Sin conexión. Lo que ves quedó guardado en el celular.' : 'Sin conexión.'}
        </p>
      )}
      {aviso && <p className="aviso aviso-fuerte" role="status">{aviso}</p>}
      {extra}
      <Instalar />
    </>
  )

  if (estado.tipo === 'listo') {
    const deOtroDia = estado.datos.fecha !== hoyEnElCelular()
    return (
      <MiDia
        datos={estado.datos}
        cuenta={cuenta}
        avisos={avisos(
          <>
            {estado.fallo && enLinea && (
              <p className="aviso">
                No se pudo actualizar Mi Día. Lo que ves es lo último guardado.
                <span className="acc"><button type="button" className="btn btn-q" onClick={recargar}>Reintentar</button></span>
              </p>
            )}
            {deOtroDia && (
              <p className="aviso">
                Es el Mi Día del {fechaEnPalabras(estado.datos.fecha)}. Uno nuevo llega de lunes a viernes a las 5:50 AM.
              </p>
            )}
          </>,
        )}
      />
    )
  }

  const pantalla = {
    cargando: { titulo: 'Mi Día', bajada: 'Cargando tu Mi Día…' },
    vacio: { titulo: 'Tu Mi Día llega a las 5:50', bajada: 'Se publica solo de lunes a viernes a las 5:50 AM. Cuando llegue, lo vas a ver aquí.' },
    error: enLinea
      ? { titulo: 'No se pudo cargar Mi Día', bajada: 'Revisa tu conexión e intenta de nuevo.' }
      : { titulo: 'No se pudo cargar Mi Día', bajada: 'Para ver Mi Día por primera vez hace falta internet.' },
  }[estado.tipo]

  return (
    <div className="wrap">
      <header className="mast"><span className="brand"><Marca />MelarLab</span></header>
      <main className="entrada">
        {avisos()}
        <h1>{pantalla.titulo}</h1>
        <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>{pantalla.bajada}</p>
        {estado.tipo === 'error' && enLinea && (
          <button type="button" className="btn" onClick={recargar}>Reintentar</button>
        )}
      </main>
      <footer className="foot">
        <div className="foot-cuenta">{cuenta}</div>
      </footer>
    </div>
  )
}

function Pantallas() {
  const enLinea = useEnLinea()
  const { sesion, salir } = useSesion()

  if (!configurada) {
    return (
      <div className="wrap">
        <header className="mast"><span className="brand"><Marca />MelarLab</span></header>
        <main className="entrada">
          <h1>Falta configurar</h1>
          <p className="bajada">Faltan los datos de Supabase. Revisa el archivo <code>.env.example</code> de la app.</p>
        </main>
      </div>
    )
  }
  if (sesion.tipo === 'cargando') return <Cabecera />
  if (sesion.tipo === 'fuera') return <Entrada enLinea={enLinea} />
  if (sesion.tipo === 'nueva-contrasena') {
    return <NuevaContrasena correo={sesion.usuario.email} enLinea={enLinea} cancelar={salir} />
  }

  return (
    <PantallaMiDia
      // Otra cuenta, otro Mi Día: la pantalla empieza de cero.
      key={sesion.usuario.id}
      usuario={sesion.usuario.id}
      correo={sesion.usuario.email}
      aviso={sesion.aviso}
      enLinea={enLinea}
      salir={salir}
    />
  )
}

export default function App() {
  return (
    <>
      <Pantallas />
      <AvisoActualizacion />
    </>
  )
}
