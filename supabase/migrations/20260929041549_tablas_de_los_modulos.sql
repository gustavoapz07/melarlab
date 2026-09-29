-- Tablas de los módulos de MelarLab (paso A5 de la hoja de ruta).
-- Salen del esquema de la hoja (docs/hoja-melarlab.md). Cada fila tiene dueño (usuario_id) y
-- RLS en cada tabla: cada usuario solo ve, agrega, cambia y borra lo suyo.
-- Los visitantes sin cuenta (anon) no tienen ningún permiso, y los usuarios con cuenta
-- (authenticated) solo pueden ver, agregar, cambiar y borrar: sin TRUNCATE, que no pasa por RLS.

-- Pone la hora del último cambio en cada fila.
create or replace function public.marcar_actualizado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;
revoke all on function public.marcar_actualizado() from public, anon, authenticated;

-- Pendientes: cosas por hacer con fecha límite.
create table public.pendientes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tarea text not null check (char_length(btrim(tarea)) between 1 and 500),
  area text not null default 'personal' check (area in ('universidad', 'personal', 'trabajo', 'melarlab')),
  fecha_limite date,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'hecho')),
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.pendientes is 'Pendientes: cosas por hacer con fecha límite.';
create index pendientes_usuario_idx on public.pendientes (usuario_id, fecha_limite);
create trigger pendientes_actualizado before update on public.pendientes
  for each row execute function public.marcar_actualizado();
alter table public.pendientes enable row level security;
revoke all on table public.pendientes from anon, authenticated;
grant select, insert, update, delete on table public.pendientes to authenticated;
create policy "Veo lo mío" on public.pendientes for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.pendientes for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.pendientes for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.pendientes for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Estudios: una fila por materia del plan de estudios.
create table public.estudios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  periodo smallint not null check (periodo between 1 and 30),
  codigo text not null check (char_length(btrim(codigo)) between 1 and 20),
  asignatura text not null check (char_length(btrim(asignatura)) between 1 and 200),
  creditos smallint not null default 0 check (creditos between 0 and 30),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cursando', 'aprobada')),
  nota_final numeric(5,2) check (nota_final between 0 and 100),
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (usuario_id, codigo)
);
comment on table public.estudios is 'Estudios: una fila por materia del plan de estudios.';
create trigger estudios_actualizado before update on public.estudios
  for each row execute function public.marcar_actualizado();
alter table public.estudios enable row level security;
revoke all on table public.estudios from anon, authenticated;
grant select, insert, update, delete on table public.estudios to authenticated;
create policy "Veo lo mío" on public.estudios for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.estudios for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.estudios for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.estudios for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Billetera: ingresos y gastos.
create table public.billetera (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('ingreso', 'gasto')),
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'HNL' check (moneda ~ '^[A-Z]{3}$'),
  categoria text not null check (categoria in ('comida', 'transporte', 'universidad', 'salud', 'entretenimiento', 'compras', 'servicios', 'trabajo', 'otro')),
  descripcion text check (char_length(descripcion) <= 500),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.billetera is 'Billetera: ingresos y gastos.';
create index billetera_usuario_idx on public.billetera (usuario_id, fecha);
create trigger billetera_actualizado before update on public.billetera
  for each row execute function public.marcar_actualizado();
alter table public.billetera enable row level security;
revoke all on table public.billetera from anon, authenticated;
grant select, insert, update, delete on table public.billetera to authenticated;
create policy "Veo lo mío" on public.billetera for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.billetera for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.billetera for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.billetera for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Gym: registro de entrenos.
create table public.gym (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  rutina text not null check (char_length(btrim(rutina)) between 1 and 200),
  duracion_min smallint check (duracion_min between 1 and 600),
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.gym is 'Gym: registro de entrenos.';
create index gym_usuario_idx on public.gym (usuario_id, fecha);
create trigger gym_actualizado before update on public.gym
  for each row execute function public.marcar_actualizado();
alter table public.gym enable row level security;
revoke all on table public.gym from anon, authenticated;
grant select, insert, update, delete on table public.gym to authenticated;
create policy "Veo lo mío" on public.gym for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.gym for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.gym for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.gym for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Comidas: qué comí y cuándo.
create table public.comidas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  momento text not null check (momento in ('desayuno', 'almuerzo', 'cena', 'merienda')),
  comida text not null check (char_length(btrim(comida)) between 1 and 500),
  casera boolean not null default false,
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.comidas is 'Comidas: qué comí y cuándo.';
create index comidas_usuario_idx on public.comidas (usuario_id, fecha);
create trigger comidas_actualizado before update on public.comidas
  for each row execute function public.marcar_actualizado();
alter table public.comidas enable row level security;
revoke all on table public.comidas from anon, authenticated;
grant select, insert, update, delete on table public.comidas to authenticated;
create policy "Veo lo mío" on public.comidas for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.comidas for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.comidas for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.comidas for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Descanso: horas de sueño. La fecha es el día en que me desperté.
create table public.descanso (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fecha date not null,
  me_dormi time not null,
  me_desperte time not null,
  horas_dormidas numeric(4,2) generated always as (round(mod(extract(epoch from (me_desperte - me_dormi)) / 3600 + 24, 24), 2)) stored,
  calidad smallint check (calidad between 1 and 5),
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.descanso is 'Descanso: horas de sueño. La fecha es el día en que me desperté.';
create index descanso_usuario_idx on public.descanso (usuario_id, fecha);
create trigger descanso_actualizado before update on public.descanso
  for each row execute function public.marcar_actualizado();
alter table public.descanso enable row level security;
revoke all on table public.descanso from anon, authenticated;
grant select, insert, update, delete on table public.descanso to authenticated;
create policy "Veo lo mío" on public.descanso for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.descanso for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.descanso for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.descanso for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Lista de deseos: productos que quiero comprar.
create table public.lista_deseos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  producto text not null check (char_length(btrim(producto)) between 1 and 200),
  enlace text check (enlace ~* '^https://[^[:space:]]+$' and char_length(enlace) <= 2000),
  precio numeric(12,2) check (precio >= 0),
  precio_objetivo numeric(12,2) check (precio_objetivo >= 0),
  moneda text not null default 'HNL' check (moneda ~ '^[A-Z]{3}$'),
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado text not null default 'quiero' check (estado in ('quiero', 'comprado', 'descartado')),
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.lista_deseos is 'Lista de deseos: productos que quiero comprar.';
create index lista_deseos_usuario_idx on public.lista_deseos (usuario_id);
create trigger lista_deseos_actualizado before update on public.lista_deseos
  for each row execute function public.marcar_actualizado();
alter table public.lista_deseos enable row level security;
revoke all on table public.lista_deseos from anon, authenticated;
grant select, insert, update, delete on table public.lista_deseos to authenticated;
create policy "Veo lo mío" on public.lista_deseos for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.lista_deseos for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.lista_deseos for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.lista_deseos for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Clientes: prospección y seguimiento.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  negocio text not null check (char_length(btrim(negocio)) between 1 and 200),
  contacto text check (char_length(contacto) <= 200),
  rubro text check (char_length(rubro) <= 100),
  estado text not null default 'prospecto' check (estado in ('prospecto', 'contactado', 'en_conversacion', 'cliente', 'descartado')),
  ultimo_contacto date,
  proximo_seguimiento date,
  notas text check (char_length(notas) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.clientes is 'Clientes: prospección y seguimiento.';
create index clientes_usuario_idx on public.clientes (usuario_id, proximo_seguimiento);
create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.marcar_actualizado();
alter table public.clientes enable row level security;
revoke all on table public.clientes from anon, authenticated;
grant select, insert, update, delete on table public.clientes to authenticated;
create policy "Veo lo mío" on public.clientes for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.clientes for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.clientes for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.clientes for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Contenido: de una idea a publicaciones.
create table public.contenido (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea text not null check (char_length(btrim(idea)) between 1 and 500),
  formato text check (formato in ('reel', 'carrusel', 'post', 'video_largo', 'historia')),
  redes text[] not null default '{}' check (redes <@ array['tiktok', 'instagram', 'linkedin', 'facebook', 'youtube']),
  estado text not null default 'idea' check (estado in ('idea', 'en_produccion', 'publicado')),
  fecha_publicacion date,
  enlace text check (enlace ~* '^https://[^[:space:]]+$' and char_length(enlace) <= 2000),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
comment on table public.contenido is 'Contenido: de una idea a publicaciones.';
create index contenido_usuario_idx on public.contenido (usuario_id);
create trigger contenido_actualizado before update on public.contenido
  for each row execute function public.marcar_actualizado();
alter table public.contenido enable row level security;
revoke all on table public.contenido from anon, authenticated;
grant select, insert, update, delete on table public.contenido to authenticated;
create policy "Veo lo mío" on public.contenido for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.contenido for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.contenido for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.contenido for delete to authenticated using ((select auth.uid()) = usuario_id);
