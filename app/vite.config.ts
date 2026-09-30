import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Cabeceras de seguridad de la app. La política de contenido (CSP) solo deja cargar lo propio
 * y hablar con el proyecto de Supabase: si algún día se cuela HTML ajeno (un correo, un evento),
 * el navegador no ejecuta sus scripts ni manda datos a otro lado.
 */
function cabecerasDeSeguridad(supabaseUrl: string | undefined): Record<string, string> {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : ''
  const conexiones = supabase ? ` ${supabase} ${supabase.replace(/^https:/, 'wss:')}` : ''
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self'${conexiones}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // Es una app personal: que no salga en los buscadores (se revisa en la Fase G).
    'X-Robots-Tag': 'noindex',
  }
}

/** Escribe dist/_headers, el archivo que Cloudflare Pages lee para poner las cabeceras. */
function cabecerasDeCloudflare(cabeceras: Record<string, string>): Plugin {
  const bloque = (ruta: string, valores: Record<string, string>) =>
    [ruta, ...Object.entries(valores).map(([nombre, valor]) => `  ${nombre}: ${valor}`)].join('\n')
  return {
    name: 'melarlab-cabeceras-de-cloudflare',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          bloque('/*', cabeceras),
          // Los archivos de assets/ llevan una huella en el nombre: si cambian, cambia el nombre.
          bloque('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
        ].join('\n') + '\n',
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // En Cloudflare Pages (CF_PAGES=1), sin los datos de Supabase la compilación falla
  // en vez de publicar una app que solo dice "Falta configurar".
  if (process.env.CF_PAGES && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en las variables del proyecto de Cloudflare Pages.')
  }
  const cabeceras = cabecerasDeSeguridad(env.VITE_SUPABASE_URL)

  return {
    plugins: [
      react(),
      cabecerasDeCloudflare(cabeceras),
      VitePWA({
        // La versión nueva espera a que se toque "Actualizar" (ver src/pwa/AvisoActualizacion.tsx).
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          id: '/',
          name: 'MelarLab',
          short_name: 'MelarLab',
          description: 'Mi Día y el resto de mi vida en orden, en el celular. Vida con ventaja.',
          lang: 'es',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#ffffff',
          categories: ['productivity', 'lifestyle'],
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Todo lo necesario para abrir la app sin internet, fuentes incluidas.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: {
      // Los datos de ejemplo de Mi Día viven fuera de app/, en modulos/mi-dia/ejemplos/.
      fs: { allow: ['..'] },
    },
    // `npm run preview` sirve la app con las mismas cabeceras que Cloudflare, para probarlas en local.
    // En `npm run dev` no se ponen: Vite necesita scripts en línea para recargar al vuelo.
    preview: { headers: cabeceras },
  }
})
