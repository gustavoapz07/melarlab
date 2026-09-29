// Ilustración "amanecer con datos": sol, luna y eventos reales del día sobre el horizonte.
// Traducción directa de art() en modulos/mi-dia/render_brief.py.
import type { ReactNode } from 'react'
import { horasDelSol, luna, MES_SINODICO } from './cielo.ts'
import { hm, toMin, type Fecha } from './formato.ts'
import type { Evento, Ubicacion } from './tipos.ts'

const n1 = (x: number) => x.toFixed(1)

interface Props {
  fecha: Fecha
  ubicacion: Ubicacion
  eventos: Evento[]
  variante: 'wide' | 'narrow'
}

export function Amanecer({ fecha, ubicacion, eventos, variante }: Props) {
  const ancho = variante === 'wide'
  const hayEventos = eventos.some((e) => e.inicio)
  const W = ancho ? 840 : 400
  const H = ancho ? (hayEventos ? 250 : 218) : (hayEventos ? 228 : 196)
  const Y = ancho ? 168 : 150 // horizonte
  const TOP = ancho ? 36 : 30 // cénit del arco
  const R = ancho ? 38 : 28 // radio del sol
  const PAD = 16
  const { salida: sr, mediodia: noon, puesta: ss } = horasDelSol(fecha, ubicacion.lat, ubicacion.lon, ubicacion.tz)

  let t0 = Math.min(4 * 60, Math.trunc(sr / 60 - 1.2) * 60)
  let t1 = Math.max(23 * 60, Math.ceil(ss / 60 + 0.75) * 60)
  for (const ev of eventos) {
    if (ev.inicio && ev.fin) {
      t0 = Math.min(t0, Math.floor(toMin(ev.inicio) / 60) * 60)
      t1 = Math.max(t1, Math.ceil(toMin(ev.fin) / 60) * 60)
    }
  }
  t1 = Math.min(t1, 24 * 60)
  const X = (t: number) => PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD)
  const hatch = `hatch-${variante}`
  const sky = `sky-${variante}`
  const xs = X(sr)
  const xn = X(noon)
  const xe = X(ss)

  // arco del sol (punteado), sin tocar el disco
  const pts: string[] = []
  const n = 90
  for (let i = 0; i <= n; i++) {
    const t = sr + ((ss - sr) * i) / n
    const x = X(t)
    const y = Y - (Y - TOP) * Math.sin((Math.PI * (t - sr)) / (ss - sr))
    if (Math.hypot(x - xs, y - Y) > R + (ancho ? 26 : 20) && Math.hypot(x - xe, y - Y) > 16) pts.push(`${n1(x)},${n1(y)}`)
  }

  // sol naciente: disco rayado en horizontal, más grueso cerca del horizonte
  const rayado: ReactNode[] = []
  const paso = ancho ? 4 : 3.5
  for (let yy = Y - R + 2; yy < Y - 1; yy += paso) {
    const half = Math.sqrt(Math.max(0, R * R - (Y - yy) ** 2))
    const w = 1.0 + 1.6 * (1 - (Y - yy) / R)
    rayado.push(<line key={yy} x1={n1(xs - half)} y1={n1(yy)} x2={n1(xs + half)} y2={n1(yy)} className="s1" strokeWidth={w.toFixed(2)} />)
  }
  const g1 = R + (ancho ? 7 : 5)
  const g2 = R + (ancho ? 17 : 12)
  const rayos = [1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (Math.PI * i) / 8
    return <line key={i} x1={n1(xs + g1 * Math.cos(a))} y1={n1(Y - g1 * Math.sin(a))} x2={n1(xs + g2 * Math.cos(a))}
      y2={n1(Y - g2 * Math.sin(a))} className="s1" strokeWidth="1.5" strokeLinecap="round" />
  })

  // luna con su fase real, en el centro de la noche
  let lunaSvg: ReactNode = null
  const { edad, luz } = luna(fecha)
  const mx = (xe + W - PAD) / 2
  const my = TOP + (ancho ? 26 : 18)
  const mr = ancho ? 11 : 8
  if (W - PAD - xe > mr * 4) {
    let sombra: ReactNode = null
    if (luz > 0.97) {
      sombra = <circle cx={n1(mx)} cy={my} r={mr} className="fbg" />
    } else if (luz > 0.03) {
      const creciente = edad < MES_SINODICO / 2
      const gibosa = luz > 0.5
      const rx = mr * Math.abs(1 - 2 * luz)
      const s1 = creciente ? 1 : 0
      const s2 = creciente ? (gibosa ? 1 : 0) : (gibosa ? 0 : 1)
      sombra = <path d={`M${n1(mx)} ${my - mr} A${mr} ${mr} 0 0 ${s1} ${n1(mx)} ${my + mr} A${rx.toFixed(2)} ${mr} 0 0 ${s2} ${n1(mx)} ${my - mr}Z`} className="fbg" />
    }
    lunaSvg = (
      <>
        <circle cx={n1(mx)} cy={my} r={mr + 4} className="fbg" />
        <circle cx={n1(mx)} cy={my} r={mr} className="f1" />
        {sombra}
        <circle cx={n1(mx)} cy={my} r={mr} fill="none" className="s1" strokeWidth="1.2" />
      </>
    )
  }

  // eventos: barras bajo el horizonte, dos carriles si se cruzan
  const carriles: number[] = []
  const barras = eventos
    .filter((e): e is Evento & { inicio: string; fin: string } => Boolean(e.inicio && e.fin))
    .sort((a, b) => toMin(a.inicio) - toMin(b.inicio))
    .map((ev, i) => {
      const a = toMin(ev.inicio)
      const b = toMin(ev.fin)
      let carril = carriles.findIndex((fin) => fin <= a)
      if (carril === -1) { carriles.push(b); carril = carriles.length - 1 } else carriles[carril] = b
      const y = Y + 7 + Math.min(carril, 1) * 15
      const props = ev.tentativo ? { className: 'fbg s1', strokeWidth: 1.2 } : { className: 'f1' }
      return <rect key={i} x={n1(X(a) + 0.5)} y={y} width={n1(Math.max(3, X(b) - X(a) - 1))} height="10" {...props} />
    })

  // escala de horas
  const ty = Y + (hayEventos ? 44 : 12)
  const escala: ReactNode[] = []
  for (let h = Math.floor(t0 / 60); h <= Math.floor(t1 / 60); h++) {
    const x = X(h * 60)
    escala.push(<line key={`t${h}`} x1={n1(x)} y1={ty} x2={n1(x)} y2={ty + (h % 3 === 0 ? 6 : 3)} className="s3" strokeWidth="1" />)
    const cada = ancho ? 3 : 6
    if (h % cada === 0 && h > 0 && h < 24 && PAD + 12 < x && x < W - PAD - 12) {
      escala.push(<text key={`l${h}`} x={n1(x)} y={ty + 22} textAnchor="middle" className="lbl">{hm(h * 60)}</text>)
    }
  }

  return (
    <svg className={`art art-${variante}`} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" className="s4" strokeWidth="1" />
        </pattern>
        <clipPath id={sky}><rect x="0" y="0" width={W} height={Y} /></clipPath>
      </defs>
      {/* noche: antes de la salida y después de la puesta */}
      <rect x={PAD} y="8" width={n1(Math.max(0, xs - PAD))} height={Y - 8} fill={`url(#${hatch})`} />
      <rect x={n1(xe)} y="8" width={n1(W - PAD - xe)} height={Y - 8} fill={`url(#${hatch})`} />
      <polyline points={pts.join(' ')} fill="none" className="s3" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 7" />
      {/* mediodía solar: marca discreta en el cénit */}
      <line x1={n1(xn)} y1={TOP - 9} x2={n1(xn)} y2={TOP - 3} className="s3" strokeWidth="1.5" />
      <g clipPath={`url(#${sky})`}>
        <circle cx={n1(xs)} cy={Y} r={R + 5} className="fbg" />
        {rayado}
        <circle cx={n1(xs)} cy={Y} r={R} fill="none" className="s1" strokeWidth="1.5" />
      </g>
      {rayos}
      {/* sol poniente: medio círculo hueco */}
      <path d={`M${n1(xe - 9)} ${Y} A9 9 0 0 1 ${n1(xe + 9)} ${Y}`} fill="none" className="s3" strokeWidth="1.5" />
      {lunaSvg}
      <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} className="s1" strokeWidth="1.5" />
      {barras}
      {escala}
    </svg>
  )
}
