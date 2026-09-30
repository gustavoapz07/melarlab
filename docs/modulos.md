# Módulos

Cada módulo es una parte de la vida que MelarLab ordena. Los nombres son claros a propósito: cualquiera tiene que entender qué hace cada uno sin explicación.

## Cómo encajan
- **Mi Día es el centro.** Cada mañana junta lo de hoy de los demás módulos.
- **Cada módulo es una pantalla de la [app](../app/README.md)** y guarda su información en un solo lugar: su tabla en Supabase ([base de datos](base-de-datos.md)), el calendario o la web. A Mi Día le pasa una o dos líneas.
- **Registrar algo no debe tomar más de unos segundos.** Por eso gastos, entrenos, comidas y horas de sueño se anotan desde la app, en el celular.

## Organización
| Módulo | Qué hace | De dónde saca los datos |
|---|---|---|
| Mi Día | Resumen de cada mañana con lo de hoy de todos los módulos | Los demás módulos |
| Pendientes | Cosas por hacer con fecha límite: de la U, personales o de trabajo | Tabla `pendientes`, desde la app |
| Agenda | Reuniones y eventos de la semana; preparación antes de cada reunión | Google Calendar y Gmail |

## Aprendizaje
| Módulo | Qué hace | De dónde saca los datos |
|---|---|---|
| Radar | Contenido relevante sobre IA, desarrollo, marketing, diseño y negocios | Búsqueda web |
| Estudios | Plan de estudios: clases, exámenes, materias y avance de la carrera | Tabla `estudios` y el calendario de la universidad |

## Salud
| Módulo | Qué hace | De dónde saca los datos |
|---|---|---|
| Gym | Rutina de la semana y registro de entrenos | Tabla `gym`, desde la app |
| Comidas | Plan de comidas y lista del súper | Tabla `comidas`, desde la app |
| Descanso | Hora para dormir y despertar; horas dormidas | Tabla `descanso`, desde la app |

## Dinero
| Módulo | Qué hace | De dónde saca los datos |
|---|---|---|
| Billetera | Ingresos y gastos por categoría; resumen del mes | Tabla `billetera`, desde la app |
| Lista de deseos | Productos que quiero comprar; aviso si baja el precio | Tabla `lista_deseos`, desde la app |

## Negocio
| Módulo | Qué hace | De dónde saca los datos |
|---|---|---|
| Clientes | Prospección y seguimiento (mini CRM) | Tabla `clientes`, desde la app |
| Contenido | De una idea a publicaciones para cinco redes | Tabla `contenido` y Radar |
