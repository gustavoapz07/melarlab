# La hoja MelarLab

Todos los módulos que necesitan guardar datos usan una sola hoja de cálculo de Google Sheets, con una pestaña por módulo. Es gratis, Claude la lee con el conector de Google Sheets, Apps Script la llena desde el bot de Telegram y se puede editar desde el celular.

Mi Día, Agenda y Radar no tienen pestaña: leen Google Calendar, Gmail y la web.

## Reglas
- Una fila por registro. La fila 1 son los encabezados y no se cambian: los scripts los usan para encontrar cada columna.
- Fechas en formato AAAA-MM-DD y horas en 24 h (23:30).
- Montos en lempiras.
- Las columnas con lista desplegable solo aceptan los valores de la lista.
- La pestaña Léeme explica cada pestaña con una fila de ejemplo. Los datos reales nunca llevan filas de ejemplo.

## Pestañas

### Pendientes
| Tarea | Área | Fecha límite | Prioridad | Estado | Creada | Notas |
|---|---|---|---|---|---|---|
| Texto | U, Personal, Trabajo, MelarLab | Fecha | Alta, Media, Baja | Pendiente, En curso, Hecho | Fecha | Texto |

### Estudios
| Período | Código | Asignatura | Créditos | Estado | Nota final | Notas |
|---|---|---|---|---|---|---|
| Número | Texto | Texto | Número | Pendiente, Cursando, Aprobada | Número | Texto |

### Billetera
| Fecha | Tipo | Monto (L) | Categoría | Descripción | Origen |
|---|---|---|---|---|---|
| Fecha | Ingreso, Gasto | Número | Comida, Transporte, Universidad, Salud, Entretenimiento, Compras, Servicios, Trabajo, Otro | Texto | Bot, Manual |

### Gym
| Fecha | Rutina | Duración (min) | Notas |
|---|---|---|---|
| Fecha | Texto | Número | Texto |

### Comidas
| Fecha | Momento | Qué comí | Casera | Notas |
|---|---|---|---|---|
| Fecha | Desayuno, Almuerzo, Cena, Merienda | Texto | Casilla | Texto |

### Descanso
| Fecha | Me dormí | Me desperté | Horas dormidas | Calidad (1-5) | Notas |
|---|---|---|---|---|---|
| Fecha en que me desperté | Hora | Hora | Fórmula | 1 a 5 | Texto |

Horas dormidas se calcula sola y cruza la medianoche: `MOD(Me desperté - Me dormí, 1) * 24`.

### Lista de deseos
| Producto | Enlace | Precio (L) | Precio objetivo (L) | Prioridad | Estado | Agregado | Notas |
|---|---|---|---|---|---|---|---|
| Texto | URL | Número | Número | Alta, Media, Baja | Quiero, Comprado, Descartado | Fecha | Texto |

### Clientes
| Negocio | Contacto | Rubro | Estado | Último contacto | Próximo seguimiento | Notas |
|---|---|---|---|---|---|---|
| Texto | Texto | Texto | Prospecto, Contactado, En conversación, Cliente, Descartado | Fecha | Fecha | Texto |

### Contenido
| Idea | Formato | Redes | Estado | Fecha de publicación | Enlace |
|---|---|---|---|---|---|
| Texto | Reel, Carrusel, Post, Video largo, Historia | Texto | Idea, En producción, Publicado | Fecha | URL |
