// Errores de Supabase Auth en español, cortos y sin detalles internos.
// Códigos: https://supabase.com/docs/guides/auth/debugging/error-codes
import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js'

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  email_not_confirmed: 'Falta confirmar tu correo. Abre el enlace que te llegó y vuelve a entrar.',
  weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres y mezcla letras y números.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  email_address_invalid: 'Revisa el correo: no parece válido.',
  validation_failed: 'Revisa el correo y la contraseña.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Intenta de nuevo en una hora.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera unos minutos.',
  signup_disabled: 'Por ahora no se pueden crear cuentas nuevas.',
  email_provider_disabled: 'Por ahora no se puede entrar con correo.',
  user_banned: 'Esta cuenta está bloqueada.',
  session_expired: 'Tu sesión venció. Entra otra vez.',
  session_not_found: 'Tu sesión venció. Entra otra vez.',
  reauthentication_needed: 'Por seguridad, entra otra vez antes de cambiar la contraseña.',
}

/** Errores que llegan en el enlace del correo. */
const DEL_ENLACE: Record<string, string> = {
  otp_expired: 'El enlace venció o ya se usó. Pide uno nuevo.',
  access_denied: 'El enlace venció o ya se usó. Pide uno nuevo.',
  flow_state_expired: 'El enlace venció. Pide uno nuevo.',
}

export function mensajeDeError(error: AuthError | Error): string {
  if (isAuthRetryableFetchError(error) || !navigator.onLine) return 'Sin conexión. Para esto hace falta internet.'
  const codigo = 'code' in error && typeof error.code === 'string' ? error.code : ''
  return POR_CODIGO[codigo] ?? 'No se pudo completar. Intenta de nuevo.'
}

export function mensajeDelEnlace(codigo: string): string {
  return DEL_ENLACE[codigo] ?? 'No se pudo abrir el enlace. Pide uno nuevo.'
}
