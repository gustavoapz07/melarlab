# Mi Día

Una página que en 30 segundos dice cómo viene el día: lo que necesita atención, la agenda, las entregas de la universidad, lo que se resolvió, novedades de IA y una idea de contenido.

## Cómo se genera
1. Una tarea programada de Claude corre de lunes a viernes a las 5:50 AM, en la nube.
2. Claude lee Google Calendar y Gmail y busca novedades de IA en la web. Cada novedad se verifica en su fuente original.
3. Escribe un JSON con los datos del día ([ejemplo](ejemplos/dia-cargado.json)).
4. [`render_brief.py`](render_brief.py) convierte el JSON en la página. Claude nunca escribe el HTML a mano, así que el diseño es el mismo todos los días.
5. Llega un aviso al celular con un resumen de dos o tres líneas.

El texto que recibe la tarea está en [prompt.ejemplo.md](prompt.ejemplo.md).

## Diseño
- Blanco y negro neutro, sin degradados, sombras ni emojis.
- Archivo para el texto e IBM Plex Mono para horas y fechas, incrustadas en la página.
- Una ilustración del amanecer con datos reales: salida y puesta del sol (calculadora solar de la NOAA), fase de la luna y los eventos del día sobre el horizonte.
- Lo accionable arriba (Atención y Agenda) y lo informativo abajo.
- Modo claro y oscuro según el sistema; pensado primero para el celular.

## Probarlo
```bash
python3 render_brief.py ejemplos/dia-cargado.json mi-dia.html
```

La ubicación sale del campo `ubicacion` del JSON (nombre, latitud, longitud y zona horaria). Si falta, el script usa una ubicación de ejemplo.

## Calidad
Con los datos de prueba: axe-core (WCAG 2.1 AA y buenas prácticas) en claro y oscuro, a 390 y 1280 px, da 0 violaciones, y html-validate (preset `standard`) no marca errores. Ver [herramientas](../../herramientas).

La página todavía dice "Brief mañanero" en la cabecera; el cambio a "Mi Día" está en la [hoja de ruta](../../docs/hoja-de-ruta.md).
