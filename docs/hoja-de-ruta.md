# Hoja de ruta

MelarLab es una app para celular: una app web instalable (PWA) para Android y iPhone, primero para mí y con cuentas de usuario desde el inicio. Antes el plan era una hoja de Google Sheets y un bot de Telegram; la hoja quedó como [primer esquema](hoja-melarlab.md) de la [base de datos](base-de-datos.md).

## Base
- [x] Mi Día (antes "brief mañanero") y Radar funcionando como tareas programadas en la nube.
- [x] Mapa de módulos.
- [x] Este repositorio.
- [x] Hoja MelarLab en Google Sheets con una pestaña por módulo ([esquema](hoja-melarlab.md)). Hoy es el antecedente de la base de datos.

## Fase A · La base de la app
Meta: una app vacía pero real, instalada en los dos celulares, con cuentas y la base lista.
- [x] Stack: React + Vite + TypeScript con `vite-plugin-pwa`, Supabase y Cloudflare Pages.
- [x] Esqueleto de la app: instalable, con el diseño de Mi Día en claro y oscuro y usable sin internet.
- [x] Cuentas con Supabase Auth: entrar, crear cuenta, recuperar la contraseña y cerrar sesión.
- [x] Una tabla por módulo en Supabase, con RLS y validaciones en la base.
- [x] Lista para publicar: cabeceras de seguridad y configuración de Cloudflare Pages.
- [x] Publicada en Cloudflare Pages e instalada en Android. Falta probarla en iPhone.
- [x] Pruebas sobre la app publicada: accesibilidad, instalación y un segundo usuario que no ve los datos del primero (en la base real).
- [x] README y documentación al día con el plan de la app.

## Fase B · Mi Día en la app
- [x] Llevar Mi Día a Supabase: una rutina de Claude Code lo publica cada mañana con un secreto que Claude no ve.
- [x] Pantalla Mi Día con datos reales: atención, agenda, entregas, novedades de IA e idea de contenido, también sin internet.
- [ ] Cambiar "brief mañanero" por "Mi Día" en la tarea programada.
- [ ] Notificación de la mañana desde la app (web push).
- [ ] Agenda: resumen de la semana y preparación de cada reunión dentro de Mi Día.

## Fase C · Pendientes y Estudios
- [x] Pendientes: agregar, marcar como hecho y fecha límite; los de hoy salen en Mi Día.
- [x] Estudios: plan de estudios con el estado de cada materia y el avance de la carrera.
- [ ] Calendario de la universidad (Canvas) suscrito en Google Calendar.

## Fase D · Billetera
- [x] Registrar un gasto en menos de 5 segundos: monto y categoría.
- [x] Resumen del mes por categoría y una línea en Mi Día.

## Fase E · Salud
- [ ] Gym, Comidas y Descanso con el mismo registro rápido.

## Fase F · El resto
- [ ] Lista de deseos, Clientes y Contenido.
- [ ] Radar como pantalla de la app.

## Fase G · Abrir la app a otros
- [ ] Mi Día para otros usuarios con la API de Claude, con tope de uso por usuario.
- [ ] Verificación de Google para leer Calendar y Gmail de otras personas.
- [ ] Política de privacidad y términos.
