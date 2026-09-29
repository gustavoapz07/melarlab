import ejemplo from '../../modulos/mi-dia/ejemplos/dia-cargado.json'
import { Entrada, NuevaContrasena } from './cuenta/Entrada.tsx'
import { configurada } from './cuenta/supabase.ts'
import { useSesion } from './cuenta/useSesion.ts'
import { Marca, MiDia } from './mi-dia/MiDia.tsx'
import type { DatosMiDia } from './mi-dia/tipos.ts'
import { AvisoActualizacion } from './pwa/AvisoActualizacion.tsx'
import { Instalar } from './pwa/Instalar.tsx'
import { useEnLinea } from './pwa/useEnLinea.ts'

// Hasta la Fase B, Mi Día se muestra con los datos ficticios del repositorio.
const datos: DatosMiDia = ejemplo

function Cabecera() {
  return (
    <div className="wrap">
      <header className="mast"><span className="brand"><Marca />MelarLab</span></header>
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
    <MiDia
      datos={datos}
      avisos={
        <>
          {!enLinea && <p className="aviso aviso-fuerte">Sin conexión. Lo que ves quedó guardado en el celular.</p>}
          {sesion.aviso && <p className="aviso aviso-fuerte" role="status">{sesion.aviso}</p>}
          <p className="aviso">Datos de ejemplo: todavía no es tu día real.</p>
          <Instalar />
        </>
      }
      cuenta={
        <>
          <span className="correo">{sesion.usuario.email}</span>
          <button type="button" className="btn btn-q" onClick={salir}>Cerrar sesión</button>
        </>
      }
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
