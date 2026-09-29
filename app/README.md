# MelarLab · app

La app para celular de MelarLab. Es una app web instalable (PWA): se instala desde el navegador en Android y en iPhone, queda en la pantalla de inicio y funciona sin internet.

Por ahora muestra **Mi Día** con los datos ficticios de [`modulos/mi-dia/ejemplos/dia-cargado.json`](../modulos/mi-dia/ejemplos/dia-cargado.json). Las cuentas, la base de datos y Mi Día con datos reales llegan en los siguientes pasos de la [hoja de ruta](../docs/hoja-de-ruta.md).

![Mi Día en la app, en el celular](../docs/capturas/app-mi-dia-390-light.png)

## Stack

| Pieza | Qué se usa |
|---|---|
| App | React 19 + Vite 8 + TypeScript |
| Instalable y sin internet | [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) con Workbox: manifiesto, íconos y service worker que guarda la app completa en el celular |
| Fuentes | Archivo e IBM Plex Mono desde `@fontsource`, solo el subconjunto latino, guardadas junto con la app |
| Datos y cuentas (próximo paso) | Supabase |
| Hosting (próximo paso) | Cloudflare Pages |

## Estructura

```
app/
├── index.html              metadatos, color de la barra y ícono de iPhone
├── vite.config.ts          manifiesto de la app y reglas del service worker
├── public/                 favicon e íconos (se generan con npm run iconos, desde la raíz)
└── src/
    ├── main.tsx            arranque y fuentes
    ├── App.tsx             Mi Día con sus avisos
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
npm run auditar -- http://localhost:4173    # accesibilidad WCAG 2.1 AA en claro y oscuro, a 390 y 1280 px
npm run capturas -- http://localhost:4173 docs/capturas/app
```

Si Playwright no encuentra Chromium, se le indica el navegador instalado con `CHROMIUM_PATH` (por ejemplo, la ruta de Chrome).

## Decisiones

- **La versión nueva no se instala sola.** La app avisa "Hay una versión nueva" y se actualiza al tocar "Actualizar", para no recargar la pantalla a mitad de un registro.
- **Solo enlaces https.** Igual que en `render_brief.py`, cualquier otro enlace se muestra como texto.
- **Sin datos personales en el repositorio.** La app solo trae los datos ficticios de ejemplo.
