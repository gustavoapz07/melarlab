import type { ReactNode } from 'react'
import { Entrada, NuevaContrasena } from './cuenta/Entrada.tsx'
import { configurada } from './cuenta/supabase.ts'
import { useSesion } from './cuenta/useSesion.ts'
import { Marco } from './Marco.tsx'
import { fechaEnPalabras, hoyEnElCelular } from './mi-dia/formato.ts'
import { Marca, MiDia } from './mi-dia/MiDia.tsx'
import { useMiDia } from './mi-dia/useMiDia.ts'
import { Enlace, NavModulos } from './navegacion.tsx'
import { PantallaPendientes, type AccionesPendientes } from './pendientes/Pendientes.tsx'
import { useRuta, type Navegar } from './rutas.ts'
import { AREAS, agrupar, cuandoVence, usePendientes } from './pendientes/usePendientes.ts'
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

interface Comun {
  enLinea: boolean
  nav: ReactNode
  cuenta: ReactNode
  /** Aviso de la sesión, como "Contraseña actualizada.". */
  aviso?: string
}

/** Avisos de arriba de cada pantalla: sin conexión, el de la sesión, lo propio de la pantalla e instalar. */
function Avisos({ enLinea, aviso, sinConexion, children }: { enLinea: boolean; aviso?: string; sinConexion: string; children?: ReactNode }) {
  return (
    <>
      {!enLinea && <p className="aviso aviso-fuerte">{sinConexion}</p>}
      {aviso && <p className="aviso aviso-fuerte" role="status">{aviso}</p>}
      {children}
      <Instalar />
    </>
  )
}

/** Mi Día real, de la tabla mi_dia, con los pendientes de hoy. Mientras no hay uno, una pantalla corta que explica por qué. */
function PantallaMiDia({ usuario, pendientes, navegar, enLinea, nav, cuenta, aviso }: Comun & {
  usuario: string
  pendientes: AccionesPendientes
  navegar: Navegar
}) {
  const { estado, recargar } = useMiDia(usuario)
  const hoy = hoyEnElCelular()

  if (estado.tipo === 'listo') {
    const deOtroDia = estado.datos.fecha !== hoy
    const g = pendientes.estado.tipo === 'listo' ? agrupar(pendientes.estado.lista, hoy) : null
    const deHoy = g ? [...g.atrasados, ...g.hoy] : []
    return (
      <MiDia
        datos={estado.datos}
        nav={nav}
        cuenta={cuenta}
        pendientes={{
          lista: deHoy.map((p) => ({ titulo: p.tarea, texto: p.notas ?? undefined, fuente: AREAS[p.area], cuando: cuandoVence(p, hoy) })),
          enlace: <Enlace a="/pendientes" navegar={navegar}>Ver todos los pendientes</Enlace>,
        }}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso} sinConexion="Sin conexión. Lo que ves quedó guardado en el celular.">
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
          </Avisos>
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
    <Marco nombre="MelarLab" nav={nav} cuenta={cuenta}>
      <Avisos enLinea={enLinea} aviso={aviso} sinConexion="Sin conexión." />
      <h1 tabIndex={-1}>{pantalla.titulo}</h1>
      <p className="bajada" role={estado.tipo === 'cargando' ? 'status' : undefined}>{pantalla.bajada}</p>
      {estado.tipo === 'error' && enLinea && (
        <button type="button" className="btn" onClick={recargar}>Reintentar</button>
      )}
    </Marco>
  )
}

/** Con la sesión abierta: la pantalla que toca según la dirección. */
function Dentro({ usuario, correo, aviso, enLinea, salir }: {
  usuario: string
  correo?: string
  aviso?: string
  enLinea: boolean
  salir: () => void
}) {
  const [ruta, navegar] = useRuta()
  // Una sola lista de pendientes para las dos pantallas: lo que cambia en una se ve en la otra.
  const pendientes = usePendientes(usuario)
  const nav = <NavModulos ruta={ruta} navegar={navegar} />
  const cuenta = (
    <>
      <span className="correo">{correo}</span>
      <button type="button" className="btn btn-q" onClick={salir}>Cerrar sesión</button>
    </>
  )

  if (ruta === '/pendientes') {
    return (
      <PantallaPendientes
        acciones={pendientes}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={pendientes.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para agregar o cambiar hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  return (
    <PantallaMiDia usuario={usuario} pendientes={pendientes} navegar={navegar} enLinea={enLinea} nav={nav} cuenta={cuenta} aviso={aviso} />
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
    <Dentro
      // Otra cuenta, otros datos: todo empieza de cero.
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
