-- Plan de gym de la semana (Fase E de la hoja de ruta): qué rutina toca cada día. Con esto, Mi Día puede
-- decir si hoy toca gym. Un día sin fila es día de descanso. Mismas reglas que las demás tablas de los
-- módulos: cada usuario ve, agrega, cambia y borra solo lo suyo, y sin cuenta no hay ningún permiso.
create table public.gym_plan (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dia smallint not null check (dia between 1 and 7),
  rutina text not null check (char_length(btrim(rutina)) between 1 and 200),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (usuario_id, dia)
);
comment on table public.gym_plan is 'Gym: la rutina que toca cada día de la semana. Un día sin fila es de descanso.';
comment on column public.gym_plan.dia is 'Día de la semana, como ISO: 1 = lunes … 7 = domingo.';
create trigger gym_plan_actualizado before update on public.gym_plan
  for each row execute function public.marcar_actualizado();
alter table public.gym_plan enable row level security;
revoke all on table public.gym_plan from anon, authenticated;
grant select, insert, update, delete on table public.gym_plan to authenticated;
create policy "Veo lo mío" on public.gym_plan for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.gym_plan for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Cambio lo mío" on public.gym_plan for update to authenticated using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.gym_plan for delete to authenticated using ((select auth.uid()) = usuario_id);
