# MelarLab · app

La app para celular de MelarLab. Es una app web instalable (PWA): se instala desde el navegador en Android y en iPhone, queda en la pantalla de inicio y funciona sin internet.

Por ahora tiene cuentas (entrar, crear cuenta, recuperar la contraseña y cerrar sesión, con Supabase Auth) y muestra **Mi Día** con los datos ficticios de [`modulos/mi-dia/ejemplos/dia-cargado.json`](../modulos/mi-dia/ejemplos/dia-cargado.json). La base de datos y Mi Día con datos reales llegan en los siguientes pasos de la [hoja de ruta](../docs/hoja-de-ruta.md).

![Mi Día en la app, en el celular](../docs/capturas/app-mi-dia-390-light.png)

## Stack

| Pieza | Qué se usa |
|---|---|
| App | React 19 + Vite 8 + TypeScript |
| Instalable y sin internet | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) con Workbox: manifiesto, íconos y service worker que guarda la app completa en el celular |
| Fuentes | Archivo e IBM Plex Mono desde `@fontsource`, solo el subconjunto latino, guardadas junto con la app |
| Cuentas | Supabase Auth con correo y contraseña (`@supabase/supabase-js`) |
| Datos (próximo paso) | Supabase: Postgres con RLS |
| Hosting (próximo paso) | Cloudflare Pages |

## Estructura

```
app/
├── index.html              metadatos, color de la barra y ícono de iPhone
├── vite.config.ts          manifiesto de la app y reglas del service worker
├── public/                 favicon e íconos (se generan con npm run iconos, desde la raíz)
└── src/
    ├── main.tsx            arranque y fuentes
    ├── App.tsx             qué pantalla toca según la sesión
    ├── cuenta/
    │   ├── supabase.ts     cliente de Supabase (solo la clave publicable)
    │   ├── useSesion.ts    estado de la sesión, también sin internet
    │   ├── Entrada.tsx     entrar, crear cuenta, recuperar y elegir contraseña nueva
    │   └── mensajes.ts     errores de Supabase en español
    ├── estilos.css         diseño de Mi Día (blanco y negro, claro y oscuro) y avisos de la app
    ├── mi-dia/
    │   ├── MiDia.tsx       la pantalla, con la misma estructura que render_brief.py
    │   ├── Amanecer.tsx    ilustración "amanecer con datos"
    │   ├── cielo.ts        salida y puesta del sol (NOAA) y fase de la luna
    │   ├── formato.ts      fechas y horas en español
    │   └── tipos.ts        forma del JSON de Mi Día
    └── pwa/
        ├── AvisoActualizacion.tsx   "Lista para usar sin internet" y "Hay una versión nueva"
        ├── Instalar.tsx             botón de instalar (Android) o instrucciones (iPhone)
        └── useEnLinea.ts            aviso de sin conexión
```

El cálculo del sol y la luna es el mismo de `render_brief.py`: se comparó con el script de Python en 16 casos (dos ciudades, años bisiestos y cambio de año) y coincide.

## Configuración

Copia `.env.example` como `.env.local` y pon la dirección y la clave publicable del proyecto de Supabase. La clave secreta nunca va en la app.

En el panel de Supabase:
- **Authentication → URL Configuration:** agregar a *Redirect URLs* las direcciones donde corre la app (`http://localhost:4173/**`, `http://localhost:5173/**` y la de Cloudflare Pages). Si no están, el enlace del correo vuelve a la *Site URL*.
- **Authentication → Sign In / Providers → Email:** largo mínimo de la contraseña en 8, igual que la app.

## Comandos

Dentro de `app/`:

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173 (sin service worker)
npm run build      # revisa tipos y compila en dist/
npm run preview    # sirve dist/ en http://localhost:4173, con service worker
npm run lint
```

Pruebas, desde la raíz del repositorio y con `npm run preview` corriendo:

```bash
npm run pwa -- http://localhost:4173        # instalable, sin internet, avisos de Android y iPhone
npm run cuentas -- http://localhost:4173    # entrar, crear cuenta, recuperar, cerrar sesión y sin internet
npm run auditar -- http://localhost:4173    # accesibilidad WCAG 2.1 AA en claro y oscuro, a 390 y 1280 px
npm run capturas -- http://localhost:4173 docs/capturas/app
```

La prueba de cuentas simula Supabase Auth dentro del navegador de prueba: no crea cuentas reales ni envía correos, y ninguna llamada sale de la computadora.

Si Playwright no encuentra Chromium, se le indica el navegador instalado con `CHROMIUM_PATH` (por ejemplo, la ruta de Chrome).

## Decisiones

- **La versión nueva no se instala sola.** La app avisa "Hay una versión nueva" y se actualiza al tocar "Actualizar", para no recargar la pantalla a mitad de un registro.
- **Correo y contraseña.** En iPhone, la app instalada y Safari no comparten lo guardado: un enlace mágico por correo se abriría en Safari y dejaría la sesión allá. Con contraseña se entra directo en la app.
- **Flujo implícito de Supabase.** Los enlaces de confirmar y de recuperar funcionan aunque se abran en otro navegador.
- **Sin internet se sigue viendo Mi Día.** Si hay una sesión guardada, la app no espera a que Supabase renueve el permiso; lo renueva sola al volver la red.
- **Mensajes sin detalles internos.** Los errores de Supabase se muestran en español y cortos; crear cuenta y recuperar la contraseña no revelan si un correo ya está registrado.
- **Solo enlaces https.** Igual que en `render_brief.py`, cualquier otro enlace se muestra como texto.
- **Sin datos personales en el repositorio.** La app solo trae los datos ficticios de ejemplo.
