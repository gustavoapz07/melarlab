// Estudios del usuario: una fila por materia de su plan, desde la tabla estudios de Supabase
// (docs/base-de-datos.md). Las reglas de la base solo le dejan a cada usuario ver, agregar, cambiar y
// borrar lo suyo, y validan lo mismo que la app (rangos, largos, código sin repetir). La copia en el
// celular y cuándo se consulta están en useTabla.ts: sin internet se ve lo guardado y para escribir hace falta red.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

export const ESTADOS = { pendiente: 'Pendiente', cursando: 'Cursando', aprobada: 'Aprobada' } as const
export type EstadoMateria = keyof typeof ESTADOS

export interface Materia {
  id: string
  periodo: number
  codigo: string
  asignatura: string
  creditos: number
  estado: EstadoMateria
  nota_final: number | null
  notas: string | null
  creado: string
  actualizado: string
}

export type CambiosMateria = Partial<Pick<Materia, 'periodo' | 'codigo' | 'asignatura' | 'creditos' | 'estado' | 'nota_final' | 'notas'>>
export type NuevaMateria = Pick<Materia, 'periodo' | 'codigo' | 'asignatura' | 'creditos' | 'notas'>
export type EstadoEstudios = EstadoTabla<Materia>

/** Límites: los mismos de la base. */
export const LARGO = { codigo: 20, asignatura: 200, notas: 2000 } as const
export const RANGO = { periodo: [1, 30], creditos: [0, 30], nota: [0, 100] } as const

const COLUMNAS = 'id, periodo, codigo, asignatura, creditos, estado, nota_final, notas, creado, actualizado'

const entero = (v: unknown, [min, max]: readonly [number, number]): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max

/** Descarta filas que no tienen la forma esperada (por ejemplo, una copia guardada vieja o dañada). */
function limpiar(v: unknown): Materia[] | null {
  if (!Array.isArray(v)) return null
  const lista: Materia[] = []
  for (const f of v) {
    if (typeof f !== 'object' || f === null) continue
    // La nota es numeric en la base: por si llega como texto, se pasa a número.
    const nota = f.nota_final === null || f.nota_final === undefined ? null : Number(f.nota_final)
    if (typeof f.id === 'string' && entero(f.periodo, RANGO.periodo) && typeof f.codigo === 'string'
      && typeof f.asignatura === 'string' && entero(f.creditos, RANGO.creditos) && esDe(ESTADOS, f.estado)
      && (nota === null || (Number.isFinite(nota) && nota >= 0 && nota <= 100))
      && (f.notas === null || typeof f.notas === 'string')
      && typeof f.creado === 'string' && typeof f.actualizado === 'string') {
      lista.push({
        id: f.id, periodo: f.periodo, codigo: f.codigo, asignatura: f.asignatura, creditos: f.creditos, estado: f.estado,
        nota_final: nota, notas: f.notas, creado: f.creado, actualizado: f.actualizado,
      })
    }
  }
  return lista
}

function consultar(senal: AbortSignal) {
  return supabase
    .from('estudios')
    .select(COLUMNAS)
    .order('periodo', { ascending: true })
    .order('codigo', { ascending: true })
    .abortSignal(senal)
}

/** El error de la base en palabras. 23505: el código ya existe para este usuario. */
function mensaje(error: { code?: string } | null, codigo?: string): string {
  if (error?.code === '23505') return codigo ? `Ya tienes una materia con el código ${codigo}.` : 'Algunas de esas materias ya están en tu plan.'
  return mensajeDeFalla()
}

export function useEstudios(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.estudios + usuario, consultar, limpiar)

  /** Agrega una o varias materias de una vez (el plan completo, por ejemplo). Devuelve un mensaje si no se pudo, o null. */
  async function agregar(nuevas: NuevaMateria[]): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { data, error } = await supabase.from('estudios').insert(nuevas).select(COLUMNAS)
    const filas = error ? null : limpiar(data)
    if (!filas) return mensaje(error, nuevas.length === 1 ? nuevas[0].codigo : undefined)
    actualizar((lista) => [...lista, ...filas])
    return null
  }

  /**
   * Cambia una materia. Se ve el cambio al instante y, si Supabase no lo acepta, vuelve a como estaba.
   * Devuelve un mensaje si no se pudo, o null si salió bien.
   */
  async function cambiar(original: Materia, cambios: CambiosMateria): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((m) => (m.id === id ? { ...m, ...cambios } : m)))
    const { data, error } = await supabase.from('estudios').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((m) => (m.id === id ? fila ?? original : m)))
    return fila ? null : mensaje(error, cambios.codigo)
  }

  /** Pone el mismo estado a varias materias (todo un período), con una sola llamada. Igual que cambiar(). */
  async function cambiarVarias(materias: Materia[], nuevo: EstadoMateria): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const originales = new Map(materias.map((m) => [m.id, m]))
    actualizar((lista) => lista.map((m) => (originales.has(m.id) ? { ...m, estado: nuevo } : m)))
    const { data, error } = await supabase.from('estudios').update({ estado: nuevo }).in('id', [...originales.keys()]).select(COLUMNAS)
    const filas = new Map((error ? [] : limpiar(data) ?? []).map((f) => [f.id, f]))
    actualizar((lista) => lista.map((m) => (originales.has(m.id) ? filas.get(m.id) ?? originales.get(m.id) ?? m : m)))
    return filas.size === originales.size ? null : mensajeDeFalla()
  }

  /** Borra una materia. Devuelve un mensaje si no se pudo, o null si salió bien. */
  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('estudios').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((m) => m.id !== id))
    return null
  }

  return { estado, agregar, cambiar, cambiarVarias, borrar, recargar }
}

// ---------- avance de la carrera y períodos ----------

export interface Avance {
  /** Créditos de todo el plan. */
  total: number
  aprobados: number
  /** Créditos de las materias que se están cursando. */
  cursando: number
  materiasCursando: number
  /** Porcentaje aprobado, hacia abajo: no dice 100 hasta aprobar todo. */
  porcentaje: number
  /** Promedio de las notas registradas, ponderado por créditos. Null si no hay ninguna. */
  promedio: number | null
}

export function calcularAvance(lista: Materia[]): Avance {
  const a: Avance = { total: 0, aprobados: 0, cursando: 0, materiasCursando: 0, porcentaje: 0, promedio: null }
  let suma = 0
  let peso = 0
  for (const m of lista) {
    a.total += m.creditos
    if (m.estado === 'aprobada') {
      a.aprobados += m.creditos
      if (m.nota_final !== null && m.creditos > 0) {
        suma += m.nota_final * m.creditos
        peso += m.creditos
      }
    } else if (m.estado === 'cursando') {
      a.cursando += m.creditos
      a.materiasCursando++
    }
  }
  if (a.total) a.porcentaje = Math.floor((a.aprobados / a.total) * 100)
  if (peso) a.promedio = Math.round((suma / peso) * 10) / 10
  return a
}

export interface Periodo {
  numero: number
  materias: Materia[]
  creditos: number
  aprobadas: number
}

/** Agrupa por período, en orden, y dentro de cada uno por nombre (el laboratorio queda junto a su clase). */
export function porPeriodo(lista: Materia[]): Periodo[] {
  const grupos = new Map<number, Materia[]>()
  for (const m of lista) grupos.set(m.periodo, [...(grupos.get(m.periodo) ?? []), m])
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, materias]) => ({
      numero,
      materias: materias.sort((a, b) => a.asignatura.localeCompare(b.asignatura, 'es')),
      creditos: materias.reduce((s, m) => s + m.creditos, 0),
      aprobadas: materias.filter((m) => m.estado === 'aprobada').length,
    }))
}

/** 1 → I, 14 → XIV. Los períodos del plan van en números romanos. */
export function romano(n: number): string {
  let r = ''
  for (const [valor, letras] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) {
    while (n >= valor) {
      r += letras
      n -= valor
    }
  }
  return r
}
