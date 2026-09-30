// Mi Día del usuario, desde la tabla mi_dia de Supabase, que la rutina de la mañana llena
// (docs/base-de-datos.md). Las reglas de la base solo le devuelven a cada usuario lo suyo.
// Se guarda una copia en el celular para abrir Mi Día sin internet; se borra al cerrar sesión.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../cuenta/supabase.ts'
import { normalizar } from './normalizar.ts'
import type { DatosMiDia } from './tipos.ts'

export type EstadoMiDia =
  | { tipo: 'cargando' }
  /** `fallo`: la última consulta no salió y lo que se ve es la copia guardada. */
  | { tipo: 'listo'; datos: DatosMiDia; fallo: boolean }
  /** Todavía no hay ningún Mi Día publicado. */
  | { tipo: 'vacio' }
  /** No se pudo cargar y no hay copia guardada. */
  | { tipo: 'error' }

const PREFIJO = 'melarlab.mi-dia.'
/** Volver a consultar al abrir la app, pero no más de una vez por minuto. */
const ESPERA_MINIMA = 60_000
/** Sin respuesta en este tiempo, la consulta se da por fallida y se sigue con la copia guardada. */
const LIMITE_CONSULTA = 15_000

function leerGuardado(usuario: string): DatosMiDia | null {
  try {
    return normalizar(JSON.parse(localStorage.getItem(PREFIJO + usuario) ?? 'null'))
  } catch {
    return null
  }
}

function guardar(usuario: string, datos: DatosMiDia | null) {
  try {
    if (datos) localStorage.setItem(PREFIJO + usuario, JSON.stringify(datos))
    else localStorage.removeItem(PREFIJO + usuario)
  } catch {
    // Sin almacenamiento: Mi Día se ve igual, solo que no queda para abrirlo sin internet.
  }
}

/** Borra del celular todos los Mi Día guardados. Se llama al cerrar sesión. */
export function borrarMiDiaGuardado() {
  try {
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith(PREFIJO)) localStorage.removeItem(clave)
    }
  } catch {
    // Sin almacenamiento: no hay nada guardado que borrar.
  }
}

export function useMiDia(usuario: string): { estado: EstadoMiDia; recargar: () => void } {
  const [estado, setEstado] = useState<EstadoMiDia>(() => {
    const guardado = leerGuardado(usuario)
    if (guardado) return { tipo: 'listo', datos: guardado, fallo: false }
    return navigator.onLine ? { tipo: 'cargando' } : { tipo: 'error' }
  })
  const ultimaConsulta = useRef(0)

  const cargar = useCallback(async () => {
    ultimaConsulta.current = Date.now()
    const fallar = () => setEstado((antes) => (antes.tipo === 'listo' ? { ...antes, fallo: true } : { tipo: 'error' }))
    const { data, error } = await supabase
      .from('mi_dia')
      .select('datos')
      .order('fecha', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(LIMITE_CONSULTA))
      .maybeSingle()
    if (error) return fallar()
    if (!data) {
      guardar(usuario, null)
      return setEstado({ tipo: 'vacio' })
    }
    const datos = normalizar(data.datos)
    if (!datos) return fallar()
    guardar(usuario, datos)
    setEstado({ tipo: 'listo', datos, fallo: false })
  }, [usuario])

  useEffect(() => {
    // Sin red no se consulta: Supabase se quedaría reintentando renovar el permiso. Se consulta al volver la red.
    // cargar() solo cambia el estado después de la respuesta de Supabase, no durante el efecto.
    // oxlint-disable-next-line react/set-state-in-effect
    if (navigator.onLine) void cargar()
    // Al volver a la app (por ejemplo, abrirla desde el ícono en la mañana) y al volver la red.
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

  return { estado, recargar: () => { if (navigator.onLine) void cargar() } }
}
