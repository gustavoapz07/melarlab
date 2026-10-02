// Web push sin dependencias: el cifrado del mensaje (RFC 8291, aes128gcm) y la firma del servidor (VAPID,
// RFC 8292), solo con WebCrypto. Corre igual en Deno (la función avisos) y en Node (herramientas/webpush.js,
// que lo comprueba con el ejemplo del RFC 8291).

/** Lo que el navegador entrega al suscribirse: a dónde mandar y con qué llaves cifrar. */
export interface Suscripcion {
  endpoint: string
  /** Llave pública del celular (P-256 sin comprimir, 65 bytes), en base64url. */
  p256dh: string
  /** Secreto de autenticación del celular (16 bytes), en base64url. */
  auth: string
}

/** Las llaves VAPID del servidor, en base64url: la pública (65 bytes) y la privada (el número d, 32 bytes). */
export interface LlavesVapid {
  publica: string
  privada: string
}

/** Los servicios de push de los navegadores. A cualquier otra dirección no se manda nada. */
export const SERVICIOS_DE_PUSH =
  /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//

const TAMANO_DE_REGISTRO = 4096
const texto = new TextEncoder()

export function deBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function aBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const todo = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of partes) {
    todo.set(p, i)
    i += p.length
  }
  return todo
}

/** HKDF con SHA-256: extrae con la sal y expande con la info. */
async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, llave, largo * 8))
}

/** La llave privada P-256 como JWK: el número d y, sacados de la pública, x e y. */
function jwkPrivada(privada: string, publica: Uint8Array): JsonWebKey {
  return { kty: 'EC', crv: 'P-256', d: privada, x: aBase64url(publica.slice(1, 33)), y: aBase64url(publica.slice(33, 65)) }
}

/**
 * Cifra un mensaje para un celular (RFC 8291). La sal y la llave de un solo uso se crean aquí; la prueba
 * las pasa fijas para reproducir el ejemplo del RFC.
 */
export async function cifrar(
  mensaje: Uint8Array,
  suscripcion: Pick<Suscripcion, 'p256dh' | 'auth'>,
  fijo?: { sal: Uint8Array; publica: Uint8Array; privada: string },
): Promise<Uint8Array> {
  const celular = deBase64url(suscripcion.p256dh)
  const secreto = deBase64url(suscripcion.auth)
  if (celular.length !== 65 || celular[0] !== 4 || secreto.length !== 16) throw new Error('Suscripción inválida.')

  let publica: Uint8Array
  let privada: CryptoKey
  if (fijo) {
    publica = fijo.publica
    privada = await crypto.subtle.importKey('jwk', jwkPrivada(fijo.privada, publica), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  } else {
    const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
    publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
    privada = par.privateKey
  }
  const sal = fijo?.sal ?? crypto.getRandomValues(new Uint8Array(16))

  const llaveDelCelular = await crypto.subtle.importKey('raw', celular, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: llaveDelCelular }, privada, 256))
  const ikm = await hkdf(secreto, compartido, unir(texto.encode('WebPush: info\0'), celular, publica), 32)
  const cek = await hkdf(sal, ikm, texto.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sal, ikm, texto.encode('Content-Encoding: nonce\0'), 12)

  // Un solo registro: el mensaje, el delimitador 0x02 y los 16 bytes de la etiqueta de AES-GCM.
  const registro = unir(mensaje, new Uint8Array([2]))
  if (registro.length + 16 > TAMANO_DE_REGISTRO) throw new Error('Mensaje demasiado largo.')
  const llave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, llave, registro))

  // Encabezado: sal (16), tamaño de registro (4), largo de la llave (1) y la llave pública de un solo uso (65).
  const encabezado = new Uint8Array(21)
  encabezado.set(sal)
  new DataView(encabezado.buffer).setUint32(16, TAMANO_DE_REGISTRO)
  encabezado[20] = publica.length
  return unir(encabezado, publica, cifrado)
}

/** La cabecera Authorization de VAPID: un JWT firmado (ES256) para el servicio de push del endpoint, válido 12 horas. */
export async function autorizacionVapid(endpoint: string, llaves: LlavesVapid, contacto: string, ahora = Date.now()): Promise<string> {
  const publica = deBase64url(llaves.publica)
  const json = (o: unknown) => aBase64url(texto.encode(JSON.stringify(o)))
  const sinFirma = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: contacto })}`
  const llave = await crypto.subtle.importKey('jwk', jwkPrivada(llaves.privada, publica), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto entrega la firma como r || s (64 bytes), que es justo el formato de un JWT.
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, texto.encode(sinFirma)))
  return `vapid t=${sinFirma}.${aBase64url(firma)}, k=${llaves.publica}`
}

/** Llaves VAPID nuevas. Se crean una sola vez y se guardan en el Vault de Supabase. */
export async function crearLlavesVapid(): Promise<LlavesVapid> {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey)
  const publica = unir(new Uint8Array([4]), deBase64url(jwk.x!), deBase64url(jwk.y!))
  return { publica: aBase64url(publica), privada: jwk.d! }
}

/**
 * Manda un aviso a un celular y devuelve el código HTTP del servicio de push: 201 es que lo recibió;
 * 404 y 410, que la suscripción ya no existe.
 */
export async function enviar(suscripcion: Suscripcion, aviso: unknown, llaves: LlavesVapid, contacto: string, horasDeVida = 2): Promise<number> {
  if (!SERVICIOS_DE_PUSH.test(suscripcion.endpoint)) throw new Error('Servicio de push desconocido.')
  const cuerpo = await cifrar(texto.encode(JSON.stringify(aviso)), suscripcion)
  const respuesta = await fetch(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await autorizacionVapid(suscripcion.endpoint, llaves, contacto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(horasDeVida * 3600),
      Urgency: 'high',
    },
    body: cuerpo,
  })
  await respuesta.body?.cancel()
  return respuesta.status
}
