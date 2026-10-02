// Función avisos: manda el aviso de Mi Día al celular con web push (paso B4 de la hoja de ruta).
// La llama Cron de lunes a viernes a las 6:00 y a las 6:30 de Honduras (privado.llamar_avisos), con el secreto
// de los avisos en el cuerpo. La base decide qué mandar y a quién (avisos_por_enviar); aquí solo se cifra, se
// firma y se manda. No usa la llave secreta de Supabase: llama a la base con la clave publicable y el secreto,
// y sin el secreto la base no responde nada. Se publica con verify_jwt = false porque Cron no trae sesión.
// En los registros solo quedan cuántos avisos salieron, nunca a dónde ni qué decían.
import { crearLlavesVapid, enviar, type LlavesVapid, type Suscripcion } from './webpush.ts'

/** El contacto que piden los servicios de push (VAPID): la dirección de la app, sin datos personales. */
const CONTACTO = 'https://melarlab.pages.dev'

interface Pendiente extends Suscripcion {
  aviso: { titulo: string; texto: string; url: string; etiqueta: string }
}

const base = Deno.env.get('SUPABASE_URL') ?? ''
const clave: string = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const respuesta = (cuerpo: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

async function llamar(nombre: string, args: Record<string, unknown>): Promise<{ status: number; datos: unknown }> {
  const r = await fetch(`${base}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: clave, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return { status: r.status, datos: r.ok ? await r.json() : await r.body?.cancel() }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respuesta({ error: 'Solo POST.' }, 405)
  let cuerpo: { secreto?: unknown; ultimo_intento?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return respuesta({ error: 'Se esperaba JSON.' }, 400)
  }
  const secreto = typeof cuerpo?.secreto === 'string' ? cuerpo.secreto : ''
  if (secreto.length < 32 || secreto.length > 200) return respuesta({ error: 'No autorizado.' }, 401)

  const pedido = await llamar('avisos_por_enviar', { secreto, ultimo_intento: cuerpo.ultimo_intento === true })
  if (pedido.status === 401 || pedido.status === 403) return respuesta({ error: 'No autorizado.' }, 401)
  if (pedido.status !== 200) {
    console.error('avisos_por_enviar respondió', pedido.status)
    return respuesta({ error: 'La base no respondió.' }, 502)
  }
  const { llaves, avisos } = pedido.datos as { llaves: LlavesVapid | null; avisos: Pendiente[] }

  // La primera vez no hay llaves: se crean y se guardan en el Vault. Sin llaves nadie pudo suscribirse todavía.
  if (!llaves) {
    const nuevas = await crearLlavesVapid()
    const guardado = await llamar('guardar_llaves_avisos', { secreto, ...nuevas })
    console.log('llaves VAPID nuevas:', guardado.status === 200 ? 'guardadas' : `error ${guardado.status}`)
    return respuesta({ llaves: guardado.status === 200 ? 'creadas' : 'error', enviados: 0, vencidos: 0, fallidos: 0 }, guardado.status === 200 ? 200 : 502)
  }

  const enviados: string[] = []
  const vencidos: string[] = []
  const fallos: string[] = []
  await Promise.all(avisos.slice(0, 500).map(async (p) => {
    try {
      const estado = await enviar(p, p.aviso, llaves, CONTACTO)
      if (estado >= 200 && estado < 300) enviados.push(p.endpoint)
      else if (estado === 404 || estado === 410) vencidos.push(p.endpoint)
      else fallos.push(String(estado))
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : 'error')
    }
  }))
  if (enviados.length || vencidos.length) {
    const anotado = await llamar('avisos_enviados', { secreto, enviados, vencidos })
    if (anotado.status !== 200) console.error('avisos_enviados respondió', anotado.status)
  }
  console.log(`avisos: ${enviados.length} enviados, ${vencidos.length} vencidos, ${fallos.length} fallidos${fallos.length ? ` (${fallos.join(', ')})` : ''}`)
  return respuesta({ enviados: enviados.length, vencidos: vencidos.length, fallidos: fallos.length })
})
