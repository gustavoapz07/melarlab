// Fechas y horas en español, sin depender de la zona horaria del celular.

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

export interface Fecha {
  y: number
  m: number
  d: number
}

/** Módulo que siempre da un resultado positivo, como el % de Python. */
export const mod = (a: number, n: number) => ((a % n) + n) % n

export function leerFecha(iso: string): Fecha {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

const utc = (f: Fecha) => new Date(Date.UTC(f.y, f.m - 1, f.d))

/** 0 = lunes … 6 = domingo. */
export const diaSemana = (f: Fecha) => mod(utc(f).getUTCDay() - 1, 7)

export function sumarDias(f: Fecha, n: number): Fecha {
  const t = utc(f)
  t.setUTCDate(t.getUTCDate() + n)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

export function semanaISO(f: Fecha): number {
  const t = utc(f)
  t.setUTCDate(t.getUTCDate() + 3 - diaSemana(f)) // jueves de esa semana
  const enero4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const jueves1 = new Date(enero4)
  jueves1.setUTCDate(enero4.getUTCDate() + 3 - mod(enero4.getUTCDay() - 1, 7))
  return 1 + Math.round((t.getTime() - jueves1.getTime()) / (7 * 86400000))
}

export const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "2026-09-30" a "miércoles 30 de septiembre". */
export function fechaEnPalabras(iso: string): string {
  const f = leerFecha(iso)
  return `${DIAS[diaSemana(f)]} ${f.d} de ${MESES[f.m - 1]}`
}

/** "2026-09-30" a "Mié 30 sep", para el encabezado de las pantallas. */
export function fechaCorta(iso: string): string {
  const f = leerFecha(iso)
  return `${mayuscula(DIAS[diaSemana(f)].slice(0, 3))} ${f.d} ${MESES[f.m - 1].slice(0, 3)}`
}

/** "2026-09-30" más n días, como "AAAA-MM-DD". */
export function sumarDiasISO(iso: string, n: number): string {
  const f = sumarDias(leerFecha(iso), n)
  return `${f.y}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`
}

/** La fecha de hoy según el reloj del celular, como "AAAA-MM-DD". */
export function hoyEnElCelular(ahora = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
}

export function toMin(s: string): number {
  const [h, m] = s.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minutos del día a "6:17 AM" o "7 PM". */
export function hm(minutos: number): string {
  const t = mod(Math.trunc(minutos), 1440)
  const h = Math.floor(t / 60)
  const m = t % 60
  const suf = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suf}` : `${h12} ${suf}`
}

/** "7 – 8:40 AM" si las dos horas caen en la misma mitad del día; si no, "11 AM – 1 PM". */
export function rango(inicio: string, fin: string): string {
  const a = toMin(inicio)
  const b = toMin(fin)
  if ((a < 720) === (mod(b, 1440) < 720)) {
    const ha = hm(a)
    return `${ha.slice(0, ha.lastIndexOf(' '))} – ${hm(b)}`
  }
  return `${hm(a)} – ${hm(b)}`
}
