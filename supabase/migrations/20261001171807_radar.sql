-- Radar en la base (Fase F de la hoja de ruta): la rutina de los domingos publica el Radar semanal de IA con
-- publicar_radar(), la única forma de escribir en la tabla, y la app lo muestra. Usa el mismo secreto que la
-- rutina de Mi Día (cabecera x-melarlab-secreto, que agrega el proxy de Anthropic por fuera de la sesión);
-- en la base solo está su huella, en privado.publicadores_mi_dia. La app solo lee: cada usuario ve lo suyo.

-- Radar: el resumen de la semana. Uno por usuario y por fecha (el domingo en que salió). Se guardan todos.
create table public.radar (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  datos jsonb not null check (jsonb_typeof(datos) = 'object'),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (usuario_id, fecha)
);
comment on table public.radar is 'Radar semanal de IA. Solo se escribe con publicar_radar().';
create trigger radar_actualizado before update on public.radar
  for each row execute function public.marcar_actualizado();
alter table public.radar enable row level security;
revoke all on table public.radar from anon, authenticated;
grant select on table public.radar to authenticated;
create policy "Veo lo mío" on public.radar for select to authenticated using ((select auth.uid()) = usuario_id);

-- Publica (o reemplaza) el Radar de una semana. Solo responde a quien trae el secreto correcto.
create or replace function public.publicar_radar(datos jsonb)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  secreto text := nullif(current_setting('request.headers', true), '')::json ->> 'x-melarlab-secreto';
  usuario uuid;
  dia date;
  hoy date := (now() at time zone 'America/Tegucigalpa')::date;
  -- La forma del JSON del Radar: app/src/radar/tipos.ts.
  permitidas constant text[] := array['fecha', 'generado', 'titular', 'resumen', 'novedades', 'probar', 'idea_servicio', 'fuentes'];
  clave text;
begin
  -- 1. Quién publica: el mismo secreto de la rutina de Mi Día. Se compara la huella, nunca el secreto.
  if secreto is null or char_length(secreto) < 32 then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select p.usuario_id into usuario
    from privado.publicadores_mi_dia p
    where p.huella = encode(pg_catalog.sha256(convert_to(secreto, 'UTF8')), 'hex');
  if usuario is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- 2. Qué publica: la forma del Radar, con un tamaño razonable.
  if datos is null or jsonb_typeof(datos) <> 'object' then
    raise exception 'El Radar tiene que ser un objeto JSON.' using errcode = '22023';
  end if;
  if octet_length(datos::text) > 100000 then
    raise exception 'El Radar es demasiado grande.' using errcode = '22023';
  end if;
  for clave in select jsonb_object_keys(datos) loop
    if not clave = any (permitidas) then
      raise exception 'Clave desconocida en el Radar: %.', left(clave, 40) using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(datos -> 'novedades') is distinct from 'array' or jsonb_array_length(datos -> 'novedades') not between 1 and 12 then
    raise exception 'Las novedades tienen que ser una lista de 1 a 12.' using errcode = '22023';
  end if;
  if datos ? 'fuentes' and (jsonb_typeof(datos -> 'fuentes') <> 'array' or jsonb_array_length(datos -> 'fuentes') > 30) then
    raise exception 'Las fuentes tienen que ser una lista de hasta 30.' using errcode = '22023';
  end if;
  foreach clave in array array['probar', 'idea_servicio'] loop
    if datos ? clave and jsonb_typeof(datos -> clave) <> 'object' then
      raise exception 'La sección % tiene que ser un objeto.', clave using errcode = '22023';
    end if;
  end loop;
  if datos ? 'titular' and (jsonb_typeof(datos -> 'titular') <> 'string' or char_length(datos ->> 'titular') > 300) then
    raise exception 'El titular tiene que ser un texto de hasta 300 caracteres.' using errcode = '22023';
  end if;

  -- 3. De qué día: la fecha del JSON, y solo de la última semana (o mañana, por la hora).
  if coalesce(datos ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Falta la fecha (AAAA-MM-DD).' using errcode = '22023';
  end if;
  begin
    dia := (datos ->> 'fecha')::date;
  exception when others then
    raise exception 'La fecha no es válida.' using errcode = '22023';
  end;
  if dia not between hoy - 7 and hoy + 1 then
    raise exception 'Solo se publica el Radar de la última semana.' using errcode = '22023';
  end if;

  insert into public.radar (usuario_id, fecha, datos)
    values (usuario, dia, datos)
    on conflict (usuario_id, fecha) do update set datos = excluded.datos;
  return dia;
end;
$$;
comment on function public.publicar_radar(jsonb) is
  'Publica el Radar de la semana. Pide el secreto de la rutina en la cabecera x-melarlab-secreto; en la base solo está su huella.';
-- La llama la rutina con la clave publicable (rol anon). Nadie más puede ejecutarla.
revoke all on function public.publicar_radar(jsonb) from public, anon, authenticated;
grant execute on function public.publicar_radar(jsonb) to anon;
