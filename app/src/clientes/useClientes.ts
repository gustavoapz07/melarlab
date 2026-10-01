// Clientes del usuario: un mini CRM, desde la tabla clientes de Supabase (docs/base-de-datos.md). Cada negocio
// va por sus etapas (prospecto, contactado, en conversación, cliente o descartado), con el último contacto y
// cuándo toca el siguiente. Son datos de otras personas: viven solo en la base, con RLS, y la app los muestra
// como texto. La copia en el celular y cuándo se consulta están en useTabla.ts.
import { supabase } from '../cuenta/supabase.ts'
import { PREFIJOS } from '../guardado.ts'
import { cuandoFue, hoyEnElCelular } from '../mi-dia/formato.ts'
import { esDe, mensajeDeFalla, useTabla, type EstadoTabla } from '../useTabla.ts'

/** En el orden del embudo. */
export const ETAPAS = {
  prospecto: 'Prospecto', contactado: 'Contactado', en_conversacion: 'En conversación', cliente: 'Cliente', descartado: 'Descartado',
} as const
export type Etapa = keyof typeof ETAPAS
export const LARGO = { negocio: 200, contacto: 200, rubro: 100, notas: 2000 } as const
/** Después de un contacto, el siguiente seguimiento se propone a esta cantidad de días. */
export const DIAS_PARA_SEGUIR = 7

export interface Cliente {
  id: string
  negocio: string
  contacto: string | null
  rubro: string | null
  estado: Etapa
  ultimo_contacto: string | null
  proximo_seguimiento: string | null
  notas: string | null
  creado: string
  actualizado: string
}

export type CambiosCliente = Partial<Omit<Cliente, 'id' | 'creado' | 'actualizado'>>
export type NuevoCliente = Pick<Cliente, 'negocio' | 'contacto' | 'rubro' | 'estado' | 'proximo_seguimiento'>
export type EstadoClientes = EstadoTabla<Cliente>

const COLUMNAS = 'id, negocio, contacto, rubro, estado, ultimo_contacto, proximo_seguimiento, notas, creado, actualizado'
const fechaONula = (v: unknown) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
const textoONulo = (v: unknown) => v === null || typeof v === 'string'

function limpiar(v: unknown): Cliente[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((f): f is Cliente => typeof f === 'object' && f !== null
    && typeof f.id === 'string' && typeof f.negocio === 'string' && textoONulo(f.contacto) && textoONulo(f.rubro)
    && esDe(ETAPAS, f.estado) && fechaONula(f.ultimo_contacto) && fechaONula(f.proximo_seguimiento) && textoONulo(f.notas)
    && typeof f.creado === 'string' && typeof f.actualizado === 'string')
}

function consultar(senal: AbortSignal) {
  return supabase.from('clientes').select(COLUMNAS).order('creado', { ascending: true }).abortSignal(senal)
}

export function useClientes(usuario: string) {
  const { estado, actualizar, recargar } = useTabla(PREFIJOS.clientes + usuario, consultar, limpiar)

  async function agregar(nuevo: NuevoCliente): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { data, error } = await supabase.from('clientes').insert(nuevo).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    if (!fila) return mensajeDeFalla()
    actualizar((lista) => [...lista, fila])
    return null
  }

  /** Cambia un negocio: se ve al instante y, si Supabase no lo acepta, vuelve a como estaba. */
  async function cambiar(original: Cliente, cambios: CambiosCliente): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { id } = original
    actualizar((lista) => lista.map((c) => (c.id === id ? { ...c, ...cambios } : c)))
    const { data, error } = await supabase.from('clientes').update(cambios).eq('id', id).select(COLUMNAS).single()
    const fila = error ? null : limpiar([data])?.[0]
    actualizar((lista) => lista.map((c) => (c.id === id ? fila ?? original : c)))
    return fila ? null : mensajeDeFalla()
  }

  async function borrar(id: string): Promise<string | null> {
    if (!navigator.onLine) return mensajeDeFalla()
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) return mensajeDeFalla()
    actualizar((lista) => lista.filter((c) => c.id !== id))
    return null
  }

  return { estado, agregar, cambiar, borrar, recargar }
}

// ---------- seguimientos y embudo ----------

/** Toca escribirle: el seguimiento es hoy o ya pasó, y no está descartado. */
export const tocaHoy = (c: Cliente, hoy = hoyEnElCelular()) => c.estado !== 'descartado' && c.proximo_seguimiento !== null && c.proximo_seguimiento <= hoy

/** "Seguimiento: hoy", "Seguimiento: jueves 8 de octubre" o, si ya pasó, "Seguimiento atrasado: ayer". */
export function seguimiento(fecha: string, hoy = hoyEnElCelular()): string {
  return `Seguimiento${fecha < hoy ? ' atrasado' : ''}: ${cuandoFue(fecha, hoy).toLowerCase()}`
}

const porSeguimiento = (a: Cliente, b: Cliente) => {
  const fa = a.proximo_seguimiento ?? '9999-12-31'
  const fb = b.proximo_seguimiento ?? '9999-12-31'
  return fa !== fb ? (fa < fb ? -1 : 1) : a.negocio.localeCompare(b.negocio, 'es')
}

/** A quién toca escribirle hoy (lo más atrasado primero), el resto por etapa del embudo, y los descartados. */
export function agrupar(lista: Cliente[], hoy = hoyEnElCelular()) {
  const ahora = lista.filter((c) => tocaHoy(c, hoy)).sort(porSeguimiento)
  const resto = lista.filter((c) => !tocaHoy(c, hoy))
  return {
    tocaHoy: ahora,
    etapas: (['prospecto', 'contactado', 'en_conversacion', 'cliente'] as const).map((e) => ({ etapa: e, lista: resto.filter((c) => c.estado === e).sort(porSeguimiento) })),
    descartados: resto.filter((c) => c.estado === 'descartado').sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)),
  }
}

/** Para Mi Día: "Toca escribirle a Panadería Lupita." o "Toca escribirles a Panadería Lupita y Ferretería Central." Null si a nadie. */
export function lineaDeClientes(lista: Cliente[], hoy = hoyEnElCelular()): string | null {
  const nombres = lista.filter((c) => tocaHoy(c, hoy)).sort(porSeguimiento).map((c) => c.negocio)
  if (!nombres.length) return null
  if (nombres.length === 1) return `Toca escribirle a ${nombres[0]}.`
  return `Toca escribirles a ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}.`
}
