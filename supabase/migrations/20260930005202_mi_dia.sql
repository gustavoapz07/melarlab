-- Mi Día en la base (paso B1 de la hoja de ruta).
-- La rutina de la mañana publica el Mi Día del día con publicar_mi_dia(), la única forma de escribir
-- en la tabla. La función pide un secreto en la cabecera x-melarlab-secreto: el proxy de Anthropic lo
-- agrega a la solicitud después de que sale de la sesión, así que Claude nunca lo ve. En la base solo
-- se guarda su huella (SHA-256), en un esquema que la API no expone.
-- La app solo lee: cada usuario ve su propio Mi Día y nada más.

-- Mi Día: el resumen de cada mañana. Un registro por usuario y por día.
create table public.mi_dia (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null,
  datos jsonb not null check (jsonb_typeof(datos) = 'object'),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (usuario_id, fecha)
);
comment on table public.mi_dia is 'Mi Día: el resumen de cada mañana. Solo se escribe con publicar_mi_dia().';
create trigger mi_dia_actualizado before update on public.mi_dia
  for each row execute function public.marcar_actualizado();
alter table public.mi_dia enable row level security;
revoke all on table public.mi_dia from anon, authenticated;
grant select on table public.mi_dia to authenticated;
create policy "Veo lo mío" on public.mi_dia for select to authenticated using ((select auth.uid()) = usuario_id);

-- Esquema privado: la API de Supabase no lo expone y nadie de afuera tiene permisos en él.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- Quién puede publicar el Mi Día de qué usuario: la huella SHA-256 de su secreto, nunca el secreto.
create table privado.publicadores_mi_dia (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  huella text not null unique check (huella ~ '^[0-9a-f]{64}$'),
  nombre text not null default 'Rutina de Mi Día' check (char_length(nombre) <= 100),
  creado timestamptz not null default now()
);
revoke all on table privado.publicadores_mi_dia from public, anon, authenticated;

-- Publica (o reemplaza) el Mi Día de un día. Solo responde a quien trae el secreto correcto.
create or replace function public.publicar_mi_dia(datos jsonb)
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
  -- Las claves de los JSON reales de la tarea y de render_brief.py.
  permitidas constant text[] := array['fecha', 'generado', 'nombre', 'titular', 'tipo_dia', 'ubicacion', 'eventos_hoy',
    'eventos_manana', 'atencion', 'entregas', 'resuelto', 'ia', 'idea', 'secciones_extra', 'fuentes'];
  listas constant text[] := array['eventos_hoy', 'eventos_manana', 'atencion', 'entregas', 'resuelto', 'ia',
    'secciones_extra', 'fuentes'];
  clave text;
begin
  -- 1. Quién publica. Un secreto aleatorio largo no se puede adivinar, así que basta con comparar huellas.
  if secreto is null or char_length(secreto) < 32 then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select p.usuario_id into usuario
    from privado.publicadores_mi_dia p
    where p.huella = encode(pg_catalog.sha256(convert_to(secreto, 'UTF8')), 'hex');
  if usuario is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- 2. Qué publica: la forma del JSON de Mi Día (app/src/mi-dia/tipos.ts), con un tamaño razonable.
  if datos is null or jsonb_typeof(datos) <> 'object' then
    raise exception 'Mi Día tiene que ser un objeto JSON.' using errcode = '22023';
  end if;
  if octet_length(datos::text) > 100000 then
    raise exception 'Mi Día es demasiado grande.' using errcode = '22023';
  end if;
  for clave in select jsonb_object_keys(datos) loop
    if not clave = any (permitidas) then
      raise exception 'Clave desconocida en Mi Día: %.', left(clave, 40) using errcode = '22023';
    end if;
  end loop;
  foreach clave in array listas loop
    if datos ? clave and (jsonb_typeof(datos -> clave) <> 'array' or jsonb_array_length(datos -> clave) > 50) then
      raise exception 'La sección % tiene que ser una lista de hasta 50 elementos.', clave using errcode = '22023';
    end if;
  end loop;
  if datos ? 'titular' and (jsonb_typeof(datos -> 'titular') <> 'string' or char_length(datos ->> 'titular') > 300) then
    raise exception 'El titular tiene que ser un texto de hasta 300 caracteres.' using errcode = '22023';
  end if;

  -- 3. Para qué día: la fecha del JSON, y solo ayer, hoy o mañana en Honduras.
  if coalesce(datos ->> 'fecha', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Falta la fecha (AAAA-MM-DD).' using errcode = '22023';
  end if;
  begin
    dia := (datos ->> 'fecha')::date;
  exception when others then
    raise exception 'La fecha no es válida.' using errcode = '22023';
  end;
  if dia not between hoy - 1 and hoy + 1 then
    raise exception 'Solo se publica el Mi Día de ayer, hoy o mañana.' using errcode = '22023';
  end if;

  insert into public.mi_dia (usuario_id, fecha, datos)
    values (usuario, dia, datos)
    on conflict (usuario_id, fecha) do update set datos = excluded.datos;
  return dia;
end;
$$;
comment on function public.publicar_mi_dia(jsonb) is
  'Publica el Mi Día del día. Pide el secreto en la cabecera x-melarlab-secreto; en la base solo está su huella.';
-- La llama la rutina con la clave publicable (rol anon). Nadie más puede ejecutarla.
revoke all on function public.publicar_mi_dia(jsonb) from public, anon, authenticated;
grant execute on function public.publicar_mi_dia(jsonb) to anon;
