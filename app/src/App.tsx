import type { ReactNode } from 'react'
import { AvisoDiario } from './avisos/AvisoDiario.tsx'
import { useAvisos } from './avisos/useAvisos.ts'
import { PantallaBilletera, type AccionesBilletera } from './billetera/Billetera.tsx'
import { resumirMes, totalEnPalabras, useBilletera } from './billetera/useBilletera.ts'
import { Entrada, NuevaContrasena } from './cuenta/Entrada.tsx'
import { PantallaClientes, type AccionesClientes } from './clientes/Clientes.tsx'
import { lineaDeClientes, useClientes } from './clientes/useClientes.ts'
import { PantallaComidas, type AccionesComidas } from './comidas/Comidas.tsx'
import { PantallaContenido, type AccionesContenido } from './contenido/Contenido.tsx'
import { deLaIdeaDeMiDia, lineaDeContenido, useContenido } from './contenido/useContenido.ts'
import { caseras, delDia, enPalabras, useComidas } from './comidas/useComidas.ts'
import { configurada } from './cuenta/supabase.ts'
import { useSesion } from './cuenta/useSesion.ts'
import { PantallaDeseos, type AccionesDeseos } from './deseos/Deseos.tsx'
import { lineaDeDeseos, useDeseos } from './deseos/useDeseos.ts'
import { PantallaDescanso, type AccionesDescanso } from './descanso/Descanso.tsx'
import { META_HORAS, NOCHES_PARA_AVISAR, duracion, resumirSueno, useDescanso } from './descanso/useDescanso.ts'
import { PantallaEstudios } from './estudios/Estudios.tsx'
import { useEstudios } from './estudios/useEstudios.ts'
import { PantallaGym, type AccionesGym } from './gym/Gym.tsx'
import { cuentaDeLaSemana, resumirGym, useGym } from './gym/useGym.ts'
import { Marco } from './Marco.tsx'
import { fechaEnPalabras, hoyEnElCelular } from './mi-dia/formato.ts'
import { Marca, MiDia, type GuardarIdea, type Linea } from './mi-dia/MiDia.tsx'
import type { Idea } from './mi-dia/tipos.ts'
import { useMiDia } from './mi-dia/useMiDia.ts'
import { Enlace, NavModulos } from './navegacion.tsx'
import { PantallaPendientes, type AccionesPendientes } from './pendientes/Pendientes.tsx'
import { PantallaRadar } from './radar/Radar.tsx'
import { useRadar } from './radar/radar.ts'
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

/**
 * Las líneas de dinero de Mi Día: lo gastado en el mes y hoy (si ya se anotó algún movimiento) y lo que
 * llegó al precio que quiero en la lista de deseos (solo si hay algo).
 */
function lineasDeDinero(billetera: AccionesBilletera, deseos: AccionesDeseos, hoy: string, navegar: Navegar) {
  const lineas: Linea[] = []
  if (billetera.estado.tipo === 'listo' && billetera.estado.lista.length) {
    const { lista } = billetera.estado
    const mes = hoy.slice(0, 7)
    const delMes = totalEnPalabras(resumirMes(lista, mes), 'gastos')
    const deHoy = totalEnPalabras(resumirMes(lista.filter((m) => m.fecha === hoy), mes), 'gastos')
    lineas.push({
      modulo: 'Billetera',
      texto: `${delMes ? `Llevas ${delMes} en gastos este mes` : 'Nada gastado este mes'}; hoy, ${deHoy ?? 'nada'}.`,
      enlace: <Enlace a="/billetera" navegar={navegar}>Abrir la billetera</Enlace>,
    })
  }
  const llegaron = deseos.estado.tipo === 'listo' ? lineaDeDeseos(deseos.estado.lista) : null
  if (llegaron) lineas.push({ modulo: 'Lista de deseos', texto: llegaron, enlace: <Enlace a="/deseos" navegar={navegar}>Ver la lista</Enlace> })
  return lineas
}

/** Las líneas de negocio de Mi Día: a quién toca escribirle y qué toca publicar hoy (solo si hay algo). */
function lineasDeNegocio(clientes: AccionesClientes, contenido: AccionesContenido, hoy: string, navegar: Navegar) {
  const lineas: Linea[] = []
  const toca = clientes.estado.tipo === 'listo' ? lineaDeClientes(clientes.estado.lista, hoy) : null
  if (toca) lineas.push({ modulo: 'Clientes', texto: toca, enlace: <Enlace a="/clientes" navegar={navegar}>Ver los clientes</Enlace> })
  const publicar = contenido.estado.tipo === 'listo' ? lineaDeContenido(contenido.estado.lista, hoy) : null
  if (publicar) lineas.push({ modulo: 'Contenido', texto: publicar, enlace: <Enlace a="/contenido" navegar={navegar}>Ver el contenido</Enlace> })
  return lineas
}

/** Guardar la idea de contenido del día como pieza del módulo Contenido. Si ya está, lo dice. */
function guardarLaIdea(idea: Idea | undefined, contenido: AccionesContenido, navegar: Navegar): GuardarIdea | undefined {
  if (!idea || contenido.estado.tipo !== 'listo') return undefined
  const nueva = deLaIdeaDeMiDia(idea)
  return {
    yaGuardada: contenido.estado.lista.some((p) => p.idea === nueva.idea),
    guardar: () => contenido.agregar(nueva),
    enlace: <Enlace a="/contenido" navegar={navegar}>Ver en Contenido</Enlace>,
  }
}

/** Lo que sobra este mes en la Billetera (ingresos menos gastos), por moneda. Solo las monedas donde sobra algo. */
function sobraDelMes(billetera: AccionesBilletera, hoy: string): Record<string, number> {
  if (billetera.estado.tipo !== 'listo') return {}
  return Object.fromEntries(resumirMes(billetera.estado.lista, hoy.slice(0, 7))
    .filter((r) => r.ingresos > r.gastos)
    .map((r) => [r.moneda, (Math.round(r.ingresos * 100) - Math.round(r.gastos * 100)) / 100]))
}

/** Las líneas de salud de Mi Día: cómo vengo durmiendo, qué hay de comer y si hoy toca gym. Un módulo que nunca se usó no sale. */
function lineasDeSalud(descanso: AccionesDescanso, comidas: AccionesComidas, gym: AccionesGym, hoy: string, navegar: Navegar) {
  const lineas: Linea[] = []
  if (descanso.estado.tipo === 'listo' && descanso.estado.lista.length) {
    const r = resumirSueno(descanso.estado.lista, hoy)
    const semana = r.promedio !== null && r.noches > 1 ? `; promedio de la semana, ${duracion(r.promedio)}` : ''
    const aviso = r.seguidasCortas >= NOCHES_PARA_AVISAR ? ` Llevas ${r.seguidasCortas} noches seguidas durmiendo menos de ${META_HORAS} h.` : ''
    lineas.push({
      modulo: 'Descanso',
      texto: (r.anoche ? `Anoche dormiste ${duracion(r.anoche.horas)}${semana}.` : 'Todavía no anotas cómo dormiste.') + aviso,
      enlace: <Enlace a="/descanso" navegar={navegar}>{r.anoche ? 'Ver el descanso' : 'Anotar la noche'}</Enlace>,
    })
  }
  if (comidas.estado.tipo === 'listo' && comidas.estado.lista.length) {
    const deHoy = delDia(comidas.estado.lista, hoy)
    const semana = caseras(comidas.estado.lista, hoy)
    lineas.push({
      modulo: 'Comidas',
      texto: (deHoy.length ? `Hoy: ${enPalabras(deHoy)}.` : 'Nada anotado para hoy.')
        + (semana.total ? ` Esta semana, ${semana.caseras} de ${semana.total} hechas en casa.` : ''),
      enlace: <Enlace a="/comidas" navegar={navegar}>{deHoy.length ? 'Ver las comidas' : 'Anotar comidas'}</Enlace>,
    })
  }
  if (gym.entrenos.tipo === 'listo' && gym.plan.tipo === 'listo' && (gym.entrenos.lista.length || gym.plan.lista.length)) {
    const r = resumirGym(gym.entrenos.lista, gym.plan.lista, hoy)
    const deHoy = r.hoy ? `Hoy entrenaste ${r.hoy.rutina}. ` : r.tocaHoy ? `Hoy toca ${r.tocaHoy}. ` : r.hayPlan ? 'Hoy descansas. ' : ''
    lineas.push({
      modulo: 'Gym',
      texto: `${deHoy}Llevas ${cuentaDeLaSemana(r)}.`,
      enlace: <Enlace a="/gym" navegar={navegar}>{r.tocaHoy && !r.hoy ? 'Anotar el entreno' : 'Ver el gym'}</Enlace>,
    })
  }
  return lineas
}

/** Mi Día real, de la tabla mi_dia, con los pendientes de hoy. Mientras no hay uno, una pantalla corta que explica por qué. */
function PantallaMiDia({ usuario, pendientes, billetera, deseos, descanso, comidas, gym, clientes, contenido, navegar, enLinea, nav, cuenta, aviso }: Comun & {
  usuario: string
  pendientes: AccionesPendientes
  billetera: AccionesBilletera
  deseos: AccionesDeseos
  descanso: AccionesDescanso
  comidas: AccionesComidas
  gym: AccionesGym
  clientes: AccionesClientes
  contenido: AccionesContenido
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
        salud={lineasDeSalud(descanso, comidas, gym, hoy, navegar)}
        dinero={lineasDeDinero(billetera, deseos, hoy, navegar)}
        negocio={lineasDeNegocio(clientes, contenido, hoy, navegar)}
        guardarIdea={guardarLaIdea(estado.datos.idea ?? undefined, contenido, navegar)}
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

/** El Radar solo se consulta mientras la pantalla está abierta: Mi Día no lo usa. */
function RutaRadar({ usuario, enLinea, nav, cuenta, aviso }: Comun & { usuario: string }) {
  const { estado, recargar } = useRadar(usuario)
  return (
    <PantallaRadar
      estado={estado}
      recargar={recargar}
      enLinea={enLinea}
      nav={nav}
      cuenta={cuenta}
      avisos={<Avisos enLinea={enLinea} aviso={aviso} sinConexion={estado.tipo === 'listo' ? 'Sin conexión. Lo que ves quedó guardado en el celular.' : 'Sin conexión.'} />}
    />
  )
}

/** Estudios solo consulta su tabla mientras la pantalla está abierta: Mi Día no la usa. */
function RutaEstudios({ usuario, enLinea, nav, cuenta, aviso }: Comun & { usuario: string }) {
  const estudios = useEstudios(usuario)
  return (
    <PantallaEstudios
      acciones={estudios}
      enLinea={enLinea}
      nav={nav}
      cuenta={cuenta}
      avisos={(
        <Avisos enLinea={enLinea} aviso={aviso}
          sinConexion={estudios.estado.tipo === 'listo'
            ? 'Sin conexión. Ves lo último guardado; para cambiar algo hace falta internet.'
            : 'Sin conexión.'} />
      )}
    />
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
  // Una sola copia de cada módulo que sale en Mi Día, para Mi Día y su pantalla: lo que cambia en una se ve en la otra.
  const pendientes = usePendientes(usuario)
  const billetera = useBilletera(usuario)
  const deseos = useDeseos(usuario)
  const descanso = useDescanso(usuario)
  const comidas = useComidas(usuario)
  const gym = useGym(usuario)
  const clientes = useClientes(usuario)
  const contenido = useContenido(usuario)
  const avisos = useAvisos()
  const nav = <NavModulos ruta={ruta} navegar={navegar} />
  // Al cerrar sesión, este celular deja de recibir el aviso de la cuenta (otra persona podría usarlo después).
  const cerrarSesion = async () => {
    await avisos.olvidar()
    salir()
  }
  const cuenta = (
    <>
      <span className="correo">{correo}</span>
      <button type="button" className="btn btn-q" onClick={cerrarSesion}>Cerrar sesión</button>
      <AvisoDiario avisos={avisos} enLinea={enLinea} />
    </>
  )

  if (ruta === '/billetera') {
    return (
      <PantallaBilletera
        acciones={billetera}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={billetera.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para anotar hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/deseos') {
    return (
      <PantallaDeseos
        acciones={deseos}
        billetera={{ sobra: sobraDelMes(billetera, hoyEnElCelular()), anotarGasto: billetera.agregar }}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={deseos.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para cambiar algo hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/descanso') {
    return (
      <PantallaDescanso
        acciones={descanso}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={descanso.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para anotar hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/comidas') {
    return (
      <PantallaComidas
        acciones={comidas}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={comidas.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para anotar hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/gym') {
    const listo = gym.entrenos.tipo === 'listo' && gym.plan.tipo === 'listo'
    return (
      <PantallaGym
        acciones={gym}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={listo ? 'Sin conexión. Ves lo último guardado; para anotar hace falta internet.' : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/contenido') {
    return (
      <PantallaContenido
        acciones={contenido}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={contenido.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para cambiar algo hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/clientes') {
    return (
      <PantallaClientes
        acciones={clientes}
        enLinea={enLinea}
        nav={nav}
        cuenta={cuenta}
        avisos={(
          <Avisos enLinea={enLinea} aviso={aviso}
            sinConexion={clientes.estado.tipo === 'listo'
              ? 'Sin conexión. Ves lo último guardado; para cambiar algo hace falta internet.'
              : 'Sin conexión.'} />
        )}
      />
    )
  }
  if (ruta === '/radar') {
    return <RutaRadar usuario={usuario} enLinea={enLinea} nav={nav} cuenta={cuenta} aviso={aviso} />
  }
  if (ruta === '/estudios') {
    return <RutaEstudios usuario={usuario} enLinea={enLinea} nav={nav} cuenta={cuenta} aviso={aviso} />
  }
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
    <PantallaMiDia usuario={usuario} pendientes={pendientes} billetera={billetera} deseos={deseos} descanso={descanso} comidas={comidas} gym={gym} clientes={clientes} contenido={contenido} navegar={navegar} enLinea={enLinea} nav={nav} cuenta={cuenta} aviso={aviso} />
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
