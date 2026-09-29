// Sol y luna del día. Misma matemática que modulos/mi-dia/render_brief.py.
import type { Fecha } from './formato.ts'

const rad = (g: number) => (g * Math.PI) / 180
const grados = (r: number) => (r * 180) / Math.PI

export interface HorasDelSol {
  /** Minutos locales desde la medianoche. */
  salida: number
  mediodia: number
  puesta: number
}

/** Calculadora solar de la NOAA. */
export function horasDelSol(f: Fecha, lat: number, lon: number, tz: number): HorasDelSol {
  let y = f.y
  let m = f.m
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  const J = Math.trunc(365.25 * (y + 4716)) + Math.trunc(30.6001 * (m + 1)) + f.d + B - 1524.5 + 0.5 - tz / 24
  const T = (J - 2451545) / 36525
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360
  const M = rad(357.52911 + T * (35999.05029 - 0.0001537 * T))
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)
  const C = Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M) * (0.019993 - 0.000101 * T) + Math.sin(3 * M) * 0.000289
  const om = rad(125.04 - 1934.136 * T)
  const lam = rad(L0 + C - 0.00569 - 0.00478 * Math.sin(om))
  const eps = rad(23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(om))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam))
  const yy = Math.tan(eps / 2) ** 2
  const L = rad(L0)
  const eqt = 4 * grados(yy * Math.sin(2 * L) - 2 * e * Math.sin(M) + 4 * e * yy * Math.sin(M) * Math.cos(2 * L)
    - 0.5 * yy * yy * Math.sin(4 * L) - 1.25 * e * e * Math.sin(2 * M))
  const ha = grados(Math.acos(Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(dec))
    - Math.tan(rad(lat)) * Math.tan(dec)))
  const mediodia = 720 - 4 * lon - eqt + tz * 60
  return { salida: mediodia - 4 * ha, mediodia, puesta: mediodia + 4 * ha }
}

export const MES_SINODICO = 29.530588853

export interface Luna {
  /** Días desde la luna nueva. */
  edad: number
  /** Fracción iluminada, de 0 a 1. */
  luz: number
  fase: string
}

/** Fase aproximada con el mes sinódico medio (puede correrse unas horas). */
export function luna(f: Fecha): Luna {
  const P = MES_SINODICO
  const dias = (Date.UTC(f.y, f.m - 1, f.d, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86400000
  const edad = ((dias % P) + P) % P
  const luz = (1 - Math.cos((2 * Math.PI * edad) / P)) / 2
  const nombres: [number, string][] = [[1.0, 'Luna nueva'], [6.4, 'Luna creciente'], [8.4, 'Cuarto creciente'],
    [13.8, 'Gibosa creciente'], [15.8, 'Luna llena'], [21.1, 'Gibosa menguante'], [23.1, 'Cuarto menguante'],
    [28.5, 'Luna menguante'], [P, 'Luna nueva']]
  const fase = nombres.find(([lim]) => edad < lim)?.[1] ?? 'Luna nueva'
  return { edad, luz, fase }
}
