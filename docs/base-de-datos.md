# La base de datos

Los datos de la app viven en Supabase (Postgres). Hay una tabla por módulo, salida del esquema de la [hoja MelarLab](hoja-melarlab.md), que queda como antecedente. Mi Día, Agenda y Radar no tienen tabla: leen Google Calendar, Gmail y la web.

La migración que crea todo está en [`supabase/migrations/`](../supabase/migrations/) y la prueba de seguridad en [`supabase/pruebas/rls.sql`](../supabase/pruebas/rls.sql).

## Seguridad

- **Cada fila tiene dueño.** `usuario_id` se llena solo con el usuario que entró (`auth.uid()`). Si se borra la cuenta, se borran sus filas.
- **RLS en todas las tablas**, con cuatro reglas: cada usuario solo ve, agrega, cambia y borra lo suyo. Tampoco puede pasarle una fila a otro usuario.
- **Permisos mínimos.** Los visitantes sin cuenta (`anon`) no tienen ningún permiso. Los usuarios con cuenta (`authenticated`) solo pueden ver, agregar, cambiar y borrar: no pueden vaciar tablas con TRUNCATE, que no pasa por RLS. El proyecto da todos los permisos por defecto, así que la migración los quita de forma explícita.
- **Validaciones en la base**, no solo en la app: listas cerradas, montos mayores que 0, largos máximos, notas de 0 a 100, calidad de 1 a 5 y enlaces solo `https://`, para que no se pueda guardar un enlace `javascript:`.

## Columnas comunes

Todas las tablas tienen `id`, `usuario_id`, `creado` y `actualizado`. `actualizado` se pone solo en cada cambio.

## Tablas

Los valores de las listas se guardan en minúscula y sin tildes; la app los muestra con su nombre en español.

| Tabla | Columnas | Valores permitidos |
|---|---|---|
| `pendientes` | tarea, area, fecha_limite, prioridad, estado, notas | area: universidad, personal, trabajo, melarlab. prioridad: alta, media, baja. estado: pendiente, en_curso, hecho |
| `estudios` | periodo, codigo, asignatura, creditos, estado, nota_final, notas | estado: pendiente, cursando, aprobada. Un código por usuario |
| `billetera` | fecha, tipo, monto, moneda, categoria, descripcion | tipo: ingreso, gasto. categoria: comida, transporte, universidad, salud, entretenimiento, compras, servicios, trabajo, otro. moneda: código de 3 letras, HNL por defecto |
| `gym` | fecha, rutina, duracion_min, notas | duración de 1 a 600 minutos |
| `comidas` | fecha, momento, comida, casera, notas | momento: desayuno, almuerzo, cena, merienda |
| `descanso` | fecha, me_dormi, me_desperte, horas_dormidas, calidad, notas | horas_dormidas se calcula sola y cruza la medianoche (23:30 a 06:00 da 6.50). calidad de 1 a 5 |
| `lista_deseos` | producto, enlace, precio, precio_objetivo, moneda, prioridad, estado, notas | estado: quiero, comprado, descartado |
| `clientes` | negocio, contacto, rubro, estado, ultimo_contacto, proximo_seguimiento, notas | estado: prospecto, contactado, en_conversacion, cliente, descartado |
| `contenido` | idea, formato, redes, estado, fecha_publicacion, enlace | formato: reel, carrusel, post, video_largo, historia. redes: tiktok, instagram, linkedin, facebook, youtube. estado: idea, en_produccion, publicado |

Las fechas son `date` y la app siempre manda la fecha local del celular: la base está en UTC y una fecha por defecto podría caer en el día equivocado de noche.

## Cambios

Cada cambio de estructura es una migración nueva en `supabase/migrations/`, con la fecha y hora en el nombre. Después de aplicarla:

1. Correr `supabase/pruebas/rls.sql` en el editor SQL de Supabase. Termina con un error a propósito, así no guarda nada, y el mensaje trae el resultado: todo tiene que salir bien.
2. Revisar los avisos de seguridad y de rendimiento de Supabase.
3. Volver a generar los tipos de la app (`app/src/cuenta/base-de-datos.ts`).
