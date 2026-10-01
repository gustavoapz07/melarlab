// Gym del usuario: los entrenos hechos (tabla gym) y el plan de la semana (tabla gym_plan: qué rutina toca
// cada día; un día sin rutina es de descanso). Ver docs/base-de-datos.md. Las reglas de la base solo le dejan
// a cada usuario ver y cambiar lo suyo. Se traen los entrenos de los últimos 60 días. La copia en el celular
// y cuándo se consulta están en useTabla.ts: sin internet se ve lo guardado y para anotar hace falta red.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { diaSemana, hoyEnElCelular, leerFecha, sumarDiasISO } from '../mi-dia/formato.ts'
import { mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

export const LARGO = { rutina: 200, notas: 2000 } as const
/** Minutos que la base acepta para un entreno. */
export const RANGO_MINUTOS = [1, 600] as const
const DIAS_VISIBLES = 60

export interface Entreno {
  id: string
  fecha: string
  rutina: string
  duracion_min: number | null
  notas: string | null
  creado: string
  actualizado: string
}

export interface DiaDelPlan {
  id: string
  /** 1 = lunes … 7 = domingo. */
  dia: number
  rutina: string
}

export type NuevoEntreno = Pick<Entreno, 'fecha' | 'rutina' | 'duracion_min' | 'notas'>
export type EstadoEntrenos = EstadoTabla<Entreno>
export type EstadoPlan = EstadoTabla<DiaDelPlan>

const COLUMNAS = 'id, fecha, rutina, duracion_min, notas, creado, actualizado'
const COLUMNAS_PLAN = 'id, dia, rutina'

function limpiarEntrenos(v: unknown): Entreno[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is Entreno => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha)
    && typeof f.rutina === 'string'
    && (f.duracion_min === null || (Number.isInteger(f.duracion_min) && f.duracion_min >= RANGO_MINUTOS[0] && f.duracion_min <= RANGO_MINUTOS[1]))
    && (f.notas === null || typeof f.notas === 'string')
    && typeof f.creado === 'string' && typeof f.actualizado === 'string')
}

function limpiarPlan(v: unknown): DiaDelPlan[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is DiaDelPlan => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && Number.isInteger(f.dia) && f.dia >= 1 && f.dia <= 7 && typeof f.rutina === 'string')
}

function consultarEntrenos(senal: AbortSignal) {
  return supabase
    .from('gym')
    .select(COLUMNAS)
    .gte('fecha', sumarDiasISO(hoyEnElCelular(), -(DIAS_VISIBLES - 1)))
    .order('fecha', { ascending: false })
    .order('creado', { ascending: false })
    .abortSignal(senal)
}

function consultarPlan(senal: AbortSignal) {
  return supabase.from('gym_plan').select(COLUMNAS_PLAN).order('dia', { ascending: true }).abortSignal(senal)
}

export function useGym(usuario: string) {
  const entrenos = useTabla(PREFIJOS.gym + usuario, consultarEntrenos, limpiarEntrenos)
  const plan = useTabla(`${PREFIJOS.gym}plan.${usuario}`, consultarPlan, limpiarPlan)

  /** Anota un entreno. Devuelve el id para poder deshacerlo, o un mensaje si no se pudo. */
  async function agregar(nuevo: NuevoEntreno): Promise<{ id: string } | { mensaje: string }> {
    if (!navigator.onLine) return { mensaje: mensajeDeFalla() }
    const { data, error } = await supabase.from('gym').insert(nuevo).select(COLUMNAS).single()
    const fila = error ? null : limpiarEntrenos([data])?.[0]
    if (!fila) return { mensaje: mensajeDeFalla() }
    entrenos.actualizar((lista) => [fila, ...lista])
    return { id: fila.id }
  }

  /** Cambia un entreno: se ve al instante y, si Supabase no lo acepta, vuelve a como estaba. */
  async function cambiar(original: Entreno, cambios: Partial<NuevoEntreno>): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    entrenos.actualizar((lista) => lista.map((e) => (e.id === id ? { ...e, ...cambios } : e)))
    const { data, error } = await supabase.from('gym').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiarEntrenos([data])?.[0]
    entrenos.actualizar((lista) => lista.map((e) => (e.id === id ? fila ?? original : e)))
    return fila ? null : mensajeDeFalla()
  }

  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('gym').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    entrenos.actualizar((lista) => lista.filter((e) => e.id !== id))
    return null
  }

  /**
   * Guarda el plan de la semana: { 1: 'Pecho', 3: 'Pierna' }. Los días con rutina se agregan o cambian en
   * una sola llamada (upsert por usuario y día); los que quedan vacíos se borran en otra.
   */
  async function guardarPlan(rutinas: Record<number, string>): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const antes = plan.estado.tipo === 'listo' ? plan.estado.lista : []
    const conRutina = Object.entries(rutinas).filter(([, r]) => r.trim()).map(([d, r]) => ({ dia: Number(d), rutina: r.trim() }))
    const vacios = antes.filter((p) => !rutinas[p.dia]?.trim()).map((p) => p.dia)
    let filas: DiaDelPlan[] = []
    if (conRutina.length) {
      const { data, error } = await supabase.from('gym_plan').upsert(conRutina, { onConflict: 'usuario_id,dia' }).select(COLUMNAS_PLAN)
      const limpias = error ? null : limpiarPlan(data)
      if (!limpias) return mensajeDeFalla()
      filas = limpias
    }
    if (vacios.length) {
      const { error } = await supabase.from('gym_plan').delete().in('dia', vacios)
      if (error) {
        // Lo que sí se guardó queda; lo que no, como estaba.
        plan.actualizar(() => [...antes.filter((p) => vacios.includes(p.dia)), ...filas].sort((a, b) => a.dia - b.dia))
        return mensajeDeFalla()
      }
    }
    plan.actualizar(() => filas.sort((a, b) => a.dia - b.dia))
    return null
  }

  return {
    entrenos: entrenos.estado,
    plan: plan.estado,
    agregar, cambiar, borrar, guardarPlan,
    recargar: () => { entrenos.recargar(); plan.recargar() },
  }
}

// ---------- la semana ----------

export const NOMBRES_DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** 1 = lunes … 7 = domingo, como en gym_plan. */
export const numeroDeDia = (fecha: string) => diaSemana(leerFecha(fecha)) + 1

/** Las fechas de lunes a domingo de la semana de hoy. */
export function semanaDe(hoy = hoyEnElCelular()): string[] {
  const lunes = sumarDiasISO(hoy, -(numeroDeDia(hoy) - 1))
  return Array.from({ length: 7 }, (_, i) => sumarDiasISO(lunes, i))
}

export interface ResumenGym {
  /** La rutina que toca hoy según el plan, o null si hoy es de descanso. */
  tocaHoy: string | null
  /** El entreno de hoy, si ya se anotó. */
  hoy: Entreno | null
  /** Días de esta semana (lunes a domingo) con al menos un entreno. */
  hechos: number
  /** Días con rutina en el plan. */
  planeados: number
  hayPlan: boolean
}

export function resumirGym(entrenos: Entreno[], plan: DiaDelPlan[], hoy = hoyEnElCelular()): ResumenGym {
  const semana = semanaDe(hoy)
  const diasHechos = new Set(entrenos.filter((e) => semana.includes(e.fecha)).map((e) => e.fecha))
  return {
    tocaHoy: plan.find((p) => p.dia === numeroDeDia(hoy))?.rutina ?? null,
    hoy: entrenos.find((e) => e.fecha === hoy) ?? null,
    hechos: diasHechos.size,
    planeados: plan.length,
    hayPlan: plan.length > 0,
  }
}

/** "2 de 4 esta semana" o, sin plan, "2 entrenos esta semana". */
export function cuentaDeLaSemana(r: ResumenGym): string {
  if (r.hayPlan) return `${r.hechos} de ${r.planeados} esta semana`
  return `${r.hechos} ${r.hechos === 1 ? 'entreno' : 'entrenos'} esta semana`
}

/** 60 → "60 min", 90 → "1 h 30 min". */
export function minutos(n: number): string {
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const m = n % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
