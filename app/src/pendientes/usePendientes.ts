// Pendientes del usuario, desde la tabla pendientes de Supabase (docs/base-de-datos.md).
// Las reglas de la base solo le dejan a cada usuario ver, agregar, cambiar y borrar lo suyo, y
// validan lo mismo que la app (largos, listas cerradas). Se guarda una copia en el celular para ver
// la lista sin internet; para escribir hace falta red. Cerrar sesión borra la copia.
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS, guardar, leerGuardado } from '../guardado.ts'
import { fechaEnPalabras, mayuscula, sumarDiasISO } from '../mi-dia/formato.ts'

export const AREAS = { universidad: 'Universidad', personal: 'Personal', trabajo: 'Trabajo', melarlab: 'MelarLab' } as const
export const PRIORIDADES = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const
export const ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', hecho: 'Hecho' } as const
export type Area = keyof typeof AREAS
export type Prioridad = keyof typeof PRIORIDADES
export type EstadoPendiente = keyof typeof ESTADOS

export interface Pendiente {
  id: string
  tarea: string
  area: Area
  fecha_limite: string | null
  prioridad: Prioridad
  estado: EstadoPendiente
  notas: string | null
  creado: string
  actualizado: string
}

export type CambiosPendiente = Partial<Pick<Pendiente, 'tarea' | 'area' | 'fecha_limite' | 'prioridad' | 'estado' | 'notas'>>
export type NuevoPendiente = Pick<Pendiente, 'tarea' | 'area' | 'fecha_limite' | 'prioridad'>

export type EstadoLista =
  | { tipo: 'cargando' }
  /** `fallo`: la última consulta no salió y lo que se ve es la copia guardada. */
  | { tipo: 'listo'; lista: Pendiente[]; fallo: boolean }
  | { tipo: 'error' }

/** Largos máximos: los mismos de la base. */
export const LARGO = { tarea: 500, notas: 2000 } as const

const COLUMNAS = 'id, tarea, area, fecha_limite, prioridad, estado, notas, creado, actualizado'
/** Los hechos se siguen viendo dos semanas, por si hay que deshacer alguno. */
const DIAS_DE_HECHOS = 14
const ESPERA_MINIMA = 60_000
const LIMITE_CONSULTA = 15_000

const esDe = <T extends object>(opciones: T, v: unknown): v is keyof T => typeof v === 'string' && v in opciones

/** Descarta filas que no tienen la forma esperada (por ejemplo, una copia guardada vieja o dañada). */
function limpiar(v: unknown): Pendiente[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is Pendiente => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && typeof f.tarea === 'string'
    && esDe(AREAS, f.area) && esDe(PRIORIDADES, f.prioridad) && esDe(ESTADOS, f.estado)
    && (f.fecha_limite === null || /^\d{4}-\d{2}-\d{2}$/.test(f.fecha_limite))
    && (f.notas === null || typeof f.notas === 'string')
    && typeof f.creado === 'string' && typeof f.actualizado === 'string')
}

export function mensajeDeFalla(): string {
  return navigator.onLine ? 'No se pudo guardar. Intenta de nuevo.' : 'Sin conexión. Para esto hace falta internet.'
}

export function usePendientes(usuario: string) {
  const clave = PREFIJOS.pendientes + usuario
  const [estado, setEstado] = useState<EstadoLista>(() => {
    const guardada = limpiar(leerGuardado(clave))
    if (guardada) return { tipo: 'listo', lista: guardada, fallo: false }
    return navigator.onLine ? { tipo: 'cargando' } : { tipo: 'error' }
  })
  const ultimaConsulta = useRef(0)

  /** Cambia la lista y su copia guardada a la vez. */
  const actualizar = useCallback((cambio: (lista: Pendiente[]) => Pendiente[]) => {
    setEstado((antes) => {
      const lista = cambio(antes.tipo === 'listo' ? antes.lista : [])
      guardar(clave, lista)
      return { tipo: 'listo', lista, fallo: false }
    })
  }, [clave])

  const cargar = useCallback(async () => {
    ultimaConsulta.current = Date.now()
    const desde = new Date(Date.now() - DIAS_DE_HECHOS * 86400000).toISOString()
    const { data, error } = await supabase
      .from('pendientes')
      .select(COLUMNAS)
      .or(`estado.neq.hecho,actualizado.gte.${desde}`)
      .order('creado', { ascending: true })
      .abortSignal(AbortSignal.timeout(LIMITE_CONSULTA))
    const lista = error ? null : limpiar(data)
    if (!lista) {
      setEstado((antes) => (antes.tipo === 'listo' ? { ...antes, fallo: true } : { tipo: 'error' }))
      return
    }
    actualizar(() => lista)
  }, [actualizar])

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

  /** Agrega un pendiente. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function agregar(nuevo: NuevoPendiente): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { data, error } = await supabase.from('pendientes').insert(nuevo).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return mensajeDeFalla()
    actualizar((lista) => [...lista, fila])
    return null
  }

  /**
   * Cambia un pendiente. Se ve el cambio al instante y, si Supabase no lo acepta, vuelve a como estaba.
   * Devuelve un mensaje si no se pudo, o null si salió bien.
   */
  async function cambiar(original: Pendiente, cambios: CambiosPendiente): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((p) => (p.id === id ? { ...p, ...cambios } : p)))
    const { data, error } = await supabase.from('pendientes').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((p) => (p.id === id ? fila ?? original : p)))
    return fila ? null : mensajeDeFalla()
  }

  /** Borra un pendiente. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('pendientes').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((p) => p.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar: () => { if (navigator.onLine) void cargar() } }
}

// ---------- orden, grupos y fechas ----------

/** "Hoy", "Mañana", "Venció el lunes 28 de septiembre" o "Jueves 1 de octubre". */
export function cuandoVence(p: Pendiente, hoy: string): string | undefined {
  if (!p.fecha_limite) return undefined
  if (p.fecha_limite === hoy) return 'Hoy'
  if (p.fecha_limite === sumarDiasISO(hoy, 1)) return 'Mañana'
  if (p.fecha_limite < hoy) return `Venció el ${fechaEnPalabras(p.fecha_limite)}`
  return mayuscula(fechaEnPalabras(p.fecha_limite))
}

const PESO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 }

function ordenar(a: Pendiente, b: Pendiente): number {
  const fa = a.fecha_limite ?? '9999-12-31'
  const fb = b.fecha_limite ?? '9999-12-31'
  if (fa !== fb) return fa < fb ? -1 : 1
  if (a.prioridad !== b.prioridad) return PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad]
  return a.creado < b.creado ? -1 : 1
}

export interface Grupos {
  atrasados: Pendiente[]
  hoy: Pendiente[]
  proximos: Pendiente[]
  sinFecha: Pendiente[]
  hechos: Pendiente[]
}

/** Separa la lista según la fecha de hoy del celular ("AAAA-MM-DD"). */
export function agrupar(lista: Pendiente[], hoy: string): Grupos {
  const porHacer = lista.filter((p) => p.estado !== 'hecho').sort(ordenar)
  return {
    atrasados: porHacer.filter((p) => p.fecha_limite !== null && p.fecha_limite < hoy),
    hoy: porHacer.filter((p) => p.fecha_limite === hoy),
    proximos: porHacer.filter((p) => p.fecha_limite !== null && p.fecha_limite > hoy),
    sinFecha: porHacer.filter((p) => p.fecha_limite === null),
    hechos: lista.filter((p) => p.estado === 'hecho').sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)),
  }
}
