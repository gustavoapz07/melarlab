// Avisa cuando la app ya funciona sin internet y cuando hay una versión nueva.
// La versión nueva no se instala sola: espera a que se toque "Actualizar", para no recargar la pantalla a mitad de algo.
import { useRegisterSW } from 'virtual:pwa-register/react'

export function AvisoActualizacion() {
  const {
    offlineReady: [listaSinRed, setListaSinRed],
    needRefresh: [hayNueva, setHayNueva],
    updateServiceWorker,
  } = useRegisterSW()

  const cerrar = () => {
    setListaSinRed(false)
    setHayNueva(false)
  }

  // El contenedor existe siempre para que los lectores de pantalla anuncien el cambio.
  return (
    <div className="toast-zona" role="status" aria-live="polite">
      {(listaSinRed || hayNueva) && (
        <div className="toast">
          <p>{hayNueva ? 'Hay una versión nueva de MelarLab.' : 'Lista para usar sin internet.'}</p>
          <div className="acc">
            {hayNueva && <button type="button" className="btn" onClick={() => updateServiceWorker(true)}>Actualizar</button>}
            <button type="button" className="btn btn-q" onClick={cerrar}>{hayNueva ? 'Después' : 'Entendido'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
