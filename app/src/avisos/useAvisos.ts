// El aviso de las 6:00 en este celular (paso B4): activarlo y apagarlo con web push.
// Activar pide permiso para avisar, suscribe el celular con la llave pública de la base (llave_avisos) y
// guarda la suscripción en la tabla avisos_push. De lunes a viernes, la función avisos de Supabase manda
// a las 6:00 el titular del Mi Día (y a las 6:30, si no llegó, lo dice). Lo muestra public/avisos-sw.js.
// En iPhone solo funciona con la app instalada en la pantalla de inicio. Para activar o apagar hace falta internet.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../cuenta/supabase.ts'
import { esIPhone, yaInstalada } from '../pwa/dispositivo.ts'

export type EstadoAvisos =
  | { tipo: 'cargando' }
  /** El navegador no tiene web push, o la app corre sin service worker (como en `npm run dev`). */
  | { tipo: 'sin-soporte' }
  /** iPhone o iPad en Safari: los avisos solo funcionan con la app instalada. */
  | { tipo: 'instalar' }
  /** Se negó el permiso: solo se vuelve a dar desde los ajustes del navegador. */
  | { tipo: 'bloqueado' }
  | { tipo: 'apagado' }
  | { tipo: 'activo' }

export interface AccionesAvisos {
  estado: EstadoAvisos
  ocupado: boolean
  /** Lo que salió mal en el último intento, para mostrarlo junto al botón. */
  error: string | null
  activar: () => Promise<void>
  apagar: () => Promise<void>
  /** Al cerrar sesión: este celular deja de recibir los avisos de la cuenta. */
  olvidar: () => Promise<void>
}

const ESPERA_DEL_SERVICE_WORKER = 8000

const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** El service worker de la app, o null si no hay (o no termina de instalarse a tiempo). */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!soportado()) return null
  const espera = new Promise<null>((listo) => setTimeout(() => listo(null), ESPERA_DEL_SERVICE_WORKER))
  return Promise.race([navigator.serviceWorker.ready, espera])
}

function deBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** ¿La suscripción es de esta llave? Si la llave cambió, la suscripción vieja ya no sirve. */
function esDeLaLlave(suscripcion: PushSubscription, llave: Uint8Array): boolean {
  const actual = suscripcion.options?.applicationServerKey
  if (!actual) return true
  const bytes = new Uint8Array(actual)
  return bytes.length === llave.length && bytes.every((b, i) => b === llave[i])
}

/** Guarda la suscripción en la base. Si ya estaba, no pasa nada. */
async function guardarSuscripcion(suscripcion: PushSubscription): Promise<boolean> {
  const { endpoint, keys } = suscripcion.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) return false
  const { error } = await supabase.from('avisos_push')
    .upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'usuario_id,endpoint', ignoreDuplicates: true })
  return !error
}

const sinConexion = () => (navigator.onLine ? null : 'Sin conexión. Para esto hace falta internet.')

export function useAvisos(): AccionesAvisos {
  const [estado, setEstado] = useState<EstadoAvisos>({ tipo: 'cargando' })
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cómo está este celular al abrir la app. Si el aviso está activo, se asegura de que la base lo tenga
  // (la función borra las suscripciones que el navegador dio de baja).
  useEffect(() => {
    let vigente = true
    ;(async () => {
      let siguiente: EstadoAvisos
      if (esIPhone() && !yaInstalada()) siguiente = { tipo: 'instalar' }
      else if (!soportado()) siguiente = { tipo: 'sin-soporte' }
      else if (Notification.permission === 'denied') siguiente = { tipo: 'bloqueado' }
      else {
        const reg = await registro()
        const suscripcion = reg ? await reg.pushManager.getSubscription() : null
        if (!reg) siguiente = { tipo: 'sin-soporte' }
        else if (suscripcion && Notification.permission === 'granted') {
          siguiente = { tipo: 'activo' }
          if (navigator.onLine) void guardarSuscripcion(suscripcion)
        } else siguiente = { tipo: 'apagado' }
      }
      if (vigente) setEstado(siguiente)
    })().catch(() => { if (vigente) setEstado({ tipo: 'sin-soporte' }) })
    return () => { vigente = false }
  }, [])

  const activar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? { tipo: 'bloqueado' } : { tipo: 'apagado' })
        return
      }
      const { data: llave, error: fallo } = await supabase.rpc('llave_avisos')
      if (fallo || !llave) {
        setError(sinConexion() ?? 'Los avisos todavía no están listos. Intenta más tarde.')
        return
      }
      const reg = await registro()
      if (!reg) {
        setEstado({ tipo: 'sin-soporte' })
        return
      }
      const clave = deBase64url(llave)
      let suscripcion = await reg.pushManager.getSubscription()
      if (suscripcion && !esDeLaLlave(suscripcion, clave)) {
        await suscripcion.unsubscribe()
        suscripcion = null
      }
      suscripcion ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave })
      if (!(await guardarSuscripcion(suscripcion))) {
        // Sin la base, el celular no recibiría nada: mejor deshacer la suscripción.
        await suscripcion.unsubscribe().catch(() => undefined)
        setError(sinConexion() ?? 'No se pudo activar. Intenta de nuevo.')
        return
      }
      setEstado({ tipo: 'activo' })
    } catch {
      setError(sinConexion() ?? 'No se pudo activar el aviso en este navegador.')
    } finally {
      setOcupado(false)
    }
  }, [])

  const apagar = useCallback(async () => {
    setError(null)
    setOcupado(true)
    try {
      const reg = await registro()
      const suscripcion = reg ? await reg.pushManager.getSubscription() : null
      if (suscripcion) {
        const { error: fallo } = await supabase.from('avisos_push').delete().eq('endpoint', suscripcion.endpoint)
        if (fallo) {
          setError(sinConexion() ?? 'No se pudo apagar. Intenta de nuevo.')
          return
        }
        await suscripcion.unsubscribe()
      }
      setEstado({ tipo: 'apagado' })
    } catch {
      setError(sinConexion() ?? 'No se pudo apagar. Intenta de nuevo.')
    } finally {
      setOcupado(false)
    }
  }, [])

  // Al cerrar sesión, el aviso se apaga en este celular aunque no haya internet: sin suscripción, el navegador
  // ya no recibe nada, y la función borra de la base la que quede cuando el servicio de push la rechace.
  const olvidar = useCallback(async () => {
    try {
      const reg = soportado() ? await navigator.serviceWorker.getRegistration() : undefined
      const suscripcion = reg ? await reg.pushManager.getSubscription() : null
      if (!suscripcion) return
      const espera = new Promise((listo) => setTimeout(listo, 3000))
      await Promise.race([supabase.from('avisos_push').delete().eq('endpoint', suscripcion.endpoint).then(() => undefined, () => undefined), espera])
      await suscripcion.unsubscribe()
    } catch {
      // Lo importante es cerrar la sesión: si algo falla aquí, se sigue.
    }
  }, [])

  return { estado, ocupado, error, activar, apagar, olvidar }
}
