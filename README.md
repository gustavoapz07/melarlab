# MelarLab

Mi sistema de automatizaciones para tener más orden en la vida. Lema: *vida con ventaja*.

**Melar**, según la RAE, es lo que hacen las abejas cuando hacen la miel y la ponen en los vasillos de los panales: producir algo de valor y guardarlo en su lugar. Eso es lo que hace cada módulo de este proyecto con una parte de mi día.

## Qué hace hoy

- **Mi Día:** cada mañana, de lunes a viernes, una página con la agenda de hoy, lo que necesita mi atención, las entregas de la U y un par de novedades de IA. Se genera sola en la nube y me llega un aviso al celular.
- **Radar:** cada domingo, un resumen de lo más útil que pasó en IA esa semana, verificado en su fuente.

## Módulos

| Área | Módulo | Qué hace | Estado |
|---|---|---|---|
| Organización | Mi Día | Resumen de cada mañana con lo de hoy de todos los módulos | Activo |
| | Pendientes | Cosas por hacer con fecha límite | Planeado |
| | Agenda | Reuniones y eventos; preparación antes de cada reunión | Planeado |
| Aprendizaje | Radar | Contenido relevante sobre mis temas | Activo |
| | Estudios | Plan de estudios, clases, exámenes y avance de la carrera | Planeado |
| Salud | Gym | Rutina y registro de entrenos | Planeado |
| | Comidas | Plan de comidas y lista del súper | Planeado |
| | Descanso | Horario de sueño y horas dormidas | Planeado |
| Dinero | Billetera | Ingresos, gastos y resumen del mes | Planeado |
| | Lista de deseos | Productos que quiero comprar y su precio | Planeado |
| Negocio | Clientes | Prospección y seguimiento de clientes | Planeado |
| | Contenido | De una idea a publicaciones para cinco redes | Planeado |

Detalle de cada uno en [docs/modulos.md](docs/modulos.md) y el orden en que se construyen en [docs/hoja-de-ruta.md](docs/hoja-de-ruta.md).

## Cómo funciona

- **Mi Día es el centro.** Junta una o dos líneas de cada módulo.
- **Tareas programadas de Claude** corren en la nube a su hora. Leen Google Calendar, Gmail y la hoja de datos, escriben un JSON y un script lo convierte en la página. No dependen de que la laptop esté encendida.
- **El diseño vive en código.** [`render_brief.py`](modulos/mi-dia/render_brief.py) convierte el JSON en HTML con el mismo diseño todos los días: blanco y negro, tipografía Archivo e IBM Plex Mono, y una ilustración del amanecer calculada con datos reales (salida y puesta del sol con la calculadora de la NOAA y fase de la luna).
- **Una sola hoja de Google Sheets como base de datos,** con una pestaña por módulo. Esquema en [docs/hoja-melarlab.md](docs/hoja-melarlab.md).
- **Una sola entrada para registrar cosas** (planeado): un bot de Telegram con Google Apps Script que guarda gastos, entrenos, comidas y horas de sueño en la hoja.

## Estructura

```
melarlab/
├── modulos/
│   ├── mi-dia/          render_brief.py, prompt de ejemplo y datos de prueba
│   └── radar/           prompt de ejemplo
├── herramientas/        auditoría de accesibilidad y capturas
└── docs/                módulos, arquitectura de la hoja, hoja de ruta y capturas
```

## Probarlo

Con Python 3 (solo librería estándar). Para incrustar las fuentes hace falta `npm`; sin él, la página usa las fuentes del sistema.

```bash
python3 modulos/mi-dia/render_brief.py modulos/mi-dia/ejemplos/dia-cargado.json mi-dia.html
```

Auditoría de accesibilidad (WCAG 2.1 AA con axe-core, en claro y oscuro, a 390 y 1280 px) y capturas:

```bash
npm install
npx playwright install chromium
npm run auditar -- mi-dia.html
npm run capturas -- mi-dia.html docs/capturas/mi-dia
```

![Mi Día con datos de prueba](docs/capturas/mi-dia-1280-light.png)

## Privacidad

Este repositorio solo tiene código, prompts de ejemplo y datos ficticios. Correos, calendario, gastos, salud y cualquier dato personal viven en mis cuentas y nunca se suben aquí (ver [.gitignore](.gitignore)).

## Costo

$0 adicional: usa lo que ya incluye mi cuenta de Claude y herramientas gratuitas (Google Calendar, Gmail, Google Sheets, Apps Script y Telegram).

## Licencia

[MIT](LICENSE).
