// El aviso de las 6:00 en el pie de cada pantalla, junto a la cuenta: si está activo en este celular y el
// botón para cambiarlo. Donde el navegador no tiene avisos no se muestra nada.
import type { AccionesAvisos } from './useAvisos.ts'

export function AvisoDiario({ avisos, enLinea }: { avisos: AccionesAvisos; enLinea: boolean }) {
  const { estado, ocupado, error } = avisos
  if (estado.tipo === 'cargando' || estado.tipo === 'sin-soporte') return null

  const texto = {
    instalar: 'Para el aviso de las 6:00, instala la app: Compartir → Agregar a pantalla de inicio.',
    bloqueado: 'Los avisos están bloqueados. Actívalos en los ajustes del sitio en el navegador.',
    apagado: 'Aviso de Mi Día a las 6:00: apagado',
    activo: 'Aviso de Mi Día a las 6:00: activo',
  }[estado.tipo]

  return (
    <div className="foot-avisos">
      <span>{texto}</span>
      {(estado.tipo === 'apagado' || estado.tipo === 'activo') && (
        <button
          type="button"
          className="btn btn-q"
          disabled={ocupado || !enLinea}
          aria-label={estado.tipo === 'activo' ? 'Apagar el aviso de Mi Día' : 'Activar el aviso de Mi Día'}
          onClick={estado.tipo === 'activo' ? avisos.apagar : avisos.activar}
        >
          {ocupado ? 'Un momento…' : estado.tipo === 'activo' ? 'Apagar' : 'Activar'}
        </button>
      )}
      {error && <span className="foot-error" role="alert">{error}</span>}
    </div>
  )
}
