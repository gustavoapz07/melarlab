// Una tabla de Supabase con su copia en el celular, para los módulos (Pendientes, Estudios y los que vengan).
// Muestra al instante lo último guardado y consulta al abrir la pantalla, al volver a la app (como mucho
// una vez por minuto) y al volver la red. Para escribir hace falta red: cada módulo agrega sus acciones
// y cambia la lista con `actualizar`, que guarda la copia a la vez. Cerrar sesión borra las copias (guardado.ts).
import { useCallback, useEffect, useRef, useState } from 'react'
import { guardar, leerGuardado } from './guardado.ts'

export type EstadoTabla<T> =
  | { tipo: 'cargando' }
  /** `fallo`: la última consulta no salió y lo que se ve es la copia guardada. */
  | { tipo: 'listo'; lista: T[]; fallo: boolean }
  | { tipo: 'error' }

/** La consulta de cada módulo. Tiene que ser una función fija (declarada fuera del componente). */
export type Consulta = (senal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>
/** Revisa lo que llega (de Supabase o de la copia guardada) y devuelve la lista, o null si no sirve. */
export type Limpiar<T> = (v: unknown) => T[] | null

const ESPERA_MINIMA = 60_000
const LIMITE_CONSULTA = 15_000

export const esDe = <T extends object>(opciones: T, v: unknown): v is keyof T => typeof v === 'string' && v in opciones

export function mensajeDeFalla(): string {
  return navigator.onLine ? 'No se pudo guardar. Intenta de nuevo.' : 'Sin conexión. Para esto hace falta internet.'
}

export function useTabla<T>(clave: string, consultar: Consulta, limpiar: Limpiar<T>) {
  const [estado, setEstado] = useState<EstadoTabla<T>>(() => {
    const guardada = limpiar(leerGuardado(clave))
    if (guardada) return { tipo: 'listo', lista: guardada, fallo: false }
    return navigator.onLine ? { tipo: 'cargando' } : { tipo: 'error' }
  })
  const ultimaConsulta = useRef(0)

  /** Cambia la lista y su copia guardada a la vez. */
  const actualizar = useCallback((cambio: (lista: T[]) => T[]) => {
    setEstado((antes) => {
      const lista = cambio(antes.tipo === 'listo' ? antes.lista : [])
      guardar(clave, lista)
      return { tipo: 'listo', lista, fallo: false }
    })
  }, [clave])

  const cargar = useCallback(async () => {
    ultimaConsulta.current = Date.now()
    const { data, error } = await consultar(AbortSignal.timeout(LIMITE_CONSULTA))
    const lista = error ? null : limpiar(data)
    if (!lista) {
      setEstado((antes) => (antes.tipo === 'listo' ? { ...antes, fallo: true } : { tipo: 'error' }))
      return
    }
    actualizar(() => lista)
  }, [actualizar, consultar, limpiar])

  useEffect(() => {
    // Sin red no se consulta: Supabase se quedaría reintentando renovar el permiso. Se consulta al volver la red.
    // cargar() solo cambia el estado después de la respuesta de Supabase, no durante el efecto.
    // oxlint-disable-next-line react/set-state-in-effect
    if (navigator.onLine) void cargar()
    const alVolver = () => {
      const toca = Date.now() - ultimaConsulta.current > ESPERA_MINIMA
      if (document.visibilityState === 'visible' && navigator.onLine && toca) void cargar()
    }
    const alConectar = () => void cargar()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alConectar)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', alConectar)
    }
  }, [cargar])

  return { estado, actualizar, recargar: () => { if (navigator.onLine) void cargar() } }
}
