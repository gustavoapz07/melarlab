import ejemplo from '../../modulos/mi-dia/ejemplos/dia-cargado.json'
import { MiDia } from './mi-dia/MiDia.tsx'
import type { DatosMiDia } from './mi-dia/tipos.ts'
import { AvisoActualizacion } from './pwa/AvisoActualizacion.tsx'
import { Instalar } from './pwa/Instalar.tsx'
import { useEnLinea } from './pwa/useEnLinea.ts'

// Hasta la Fase B, Mi Día se muestra con los datos ficticios del repositorio.
const datos: DatosMiDia = ejemplo

export default function App() {
  const enLinea = useEnLinea()
  return (
    <>
      <MiDia
        datos={datos}
        avisos={
          <>
            {!enLinea && <p className="aviso aviso-fuerte">Sin conexión. Lo que ves quedó guardado en el celular.</p>}
            <p className="aviso">Datos de ejemplo. La app todavía no está conectada.</p>
            <Instalar />
          </>
        }
      />
      <AvisoActualizacion />
    </>
  )
}
