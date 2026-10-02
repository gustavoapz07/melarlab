-- Avisos en el celular (paso B4 de la hoja de ruta): el aviso de Mi Día llega por web push, sin la app de Claude.
-- Cada celular que activa el aviso guarda aquí su suscripción (avisos_push). De lunes a viernes, Cron llama a la
-- función avisos (supabase/functions/avisos) a las 6:00 y a las 6:30 de Honduras. La función le pregunta a la
-- base qué mandar y a quién (avisos_por_enviar), cifra cada aviso y lo manda al servicio de push del navegador.
--   6:00: si el Mi Día de hoy ya está, "Mi Día" con su titular.
--   6:30: si todavía no está, "Mi Día no llegó" a quien tiene la rutina (el aviso del punto 10 de seguridad).
-- Un aviso por celular y por día: lo que ya se mandó queda anotado en ultimo_aviso.
--
-- Los secretos viven en el Vault de Supabase:
--   melarlab_avisos: con él Cron llama a la función, y la función a la base. Se crea aquí, al azar, y nadie lo ve.
--   melarlab_vapid_publica y melarlab_vapid_privada: las llaves VAPID. Las crea la función la primera vez.
--   project_url: la dirección del proyecto, como en la guía de Supabase para llamar funciones desde Cron.
--     No está en este archivo: se agrega una vez con vault.create_secret('https://<proyecto>.supabase.co', 'project_url').
-- La app solo lee la llave pública (llave_avisos) y cada usuario ve, agrega y borra sus propias suscripciones.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Suscripciones: una por celular (o navegador) y por usuario.
create table public.avisos_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Solo los servicios de push de los navegadores (la misma lista que SERVICIOS_DE_PUSH en webpush.ts).
  endpoint text not null check (char_length(endpoint) <= 1000 and endpoint ~
    '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  -- Llave pública del celular (65 bytes) y su secreto (16 bytes), en base64url.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}(==)?$'),
  -- El día (de Honduras) del último aviso que se mandó a este celular. Solo lo cambia la función avisos.
  ultimo_aviso date,
  creado timestamptz not null default now(),
  unique (usuario_id, endpoint)
);
comment on table public.avisos_push is 'Celulares con el aviso de Mi Día activo (web push).';
alter table public.avisos_push enable row level security;
revoke all on table public.avisos_push from anon, authenticated;
-- Sin update: la app agrega y borra; ultimo_aviso lo anota la función.
grant select, insert, delete on table public.avisos_push to authenticated;
create policy "Veo lo mío" on public.avisos_push for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "Agrego a lo mío" on public.avisos_push for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "Borro lo mío" on public.avisos_push for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Hasta 10 celulares por usuario: cada uno recibe un aviso al día.
create or replace function public.limitar_avisos_push()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.avisos_push where usuario_id = new.usuario_id) >= 10 then
    raise exception 'Ya hay 10 celulares con el aviso activo.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.limitar_avisos_push() from public, anon, authenticated;
create trigger avisos_push_limite before insert on public.avisos_push
  for each row execute function public.limitar_avisos_push();

-- El secreto de los avisos, al azar y dentro de la base. Ni este archivo ni nadie lo conoce.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'melarlab_avisos',
  'Con este secreto Cron llama a la función avisos y la función a la base. Se creó al azar dentro de la base.');

-- ¿Es el secreto de los avisos?
create or replace function privado.secreto_de_avisos(secreto text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select char_length(coalesce(secreto, '')) >= 32 and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'melarlab_avisos' and s.decrypted_secret = secreto)
$$;
revoke all on function privado.secreto_de_avisos(text) from public, anon, authenticated;

-- Lo que hay que mandar ahora: las llaves VAPID y un aviso por cada celular que todavía no lo recibió hoy.
-- ultimo_intento es la llamada de las 6:30: si el Mi Día de hoy no llegó, avisa eso a quien tiene la rutina.
create or replace function public.avisos_por_enviar(secreto text, ultimo_intento boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Tegucigalpa')::date;
  llaves jsonb;
  avisos jsonb;
begin
  if not privado.secreto_de_avisos(secreto) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object('publica', pub.decrypted_secret, 'privada', pri.decrypted_secret) into llaves
    from vault.decrypted_secrets pub, vault.decrypted_secrets pri
    where pub.name = 'melarlab_vapid_publica' and pri.name = 'melarlab_vapid_privada';

  select coalesce(jsonb_agg(jsonb_build_object(
      'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
      'aviso', case
        when m.id is not null then jsonb_build_object('titulo', 'Mi Día', 'url', '/', 'etiqueta', 'mi-dia',
          'texto', coalesce(nullif(left(btrim(m.datos ->> 'titular'), 200), ''), 'Tu Mi Día de hoy está listo.'))
        else jsonb_build_object('titulo', 'Mi Día no llegó', 'url', '/', 'etiqueta', 'mi-dia',
          'texto', 'La rutina no publicó el Mi Día de hoy. Revísala en claude.ai/code/routines.')
      end) order by s.creado), '[]'::jsonb) into avisos
    from public.avisos_push s
    left join public.mi_dia m on m.usuario_id = s.usuario_id and m.fecha = hoy
    where s.ultimo_aviso is distinct from hoy
      and (m.id is not null
        or (ultimo_intento and extract(isodow from hoy) <= 5
          and exists (select 1 from privado.publicadores_mi_dia p where p.usuario_id = s.usuario_id)));

  return jsonb_build_object('fecha', hoy, 'llaves', llaves, 'avisos', avisos);
end;
$$;
comment on function public.avisos_por_enviar(text, boolean) is
  'Para la función avisos: las llaves VAPID y los avisos pendientes de hoy. Pide el secreto de los avisos.';

-- Lo que pasó al mandar: a qué celulares llegó (no se les vuelve a mandar hoy) y cuáles ya no existen (se borran).
create or replace function public.avisos_enviados(secreto text, enviados text[], vencidos text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoy date := (now() at time zone 'America/Tegucigalpa')::date;
  n int;
  m int;
begin
  if not privado.secreto_de_avisos(secreto) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update public.avisos_push set ultimo_aviso = hoy where endpoint = any (coalesce(enviados, '{}'));
  get diagnostics n = row_count;
  delete from public.avisos_push where endpoint = any (coalesce(vencidos, '{}'));
  get diagnostics m = row_count;
  return n + m;
end;
$$;
comment on function public.avisos_enviados(text, text[], text[]) is
  'Para la función avisos: anota los avisos que llegaron y borra las suscripciones vencidas. Pide el secreto de los avisos.';

-- Guarda las llaves VAPID la primera vez. Si ya hay, no las cambia: los celulares suscritos dependen de ellas.
create or replace function public.guardar_llaves_avisos(secreto text, publica text, privada text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.secreto_de_avisos(secreto) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if coalesce(publica, '') !~ '^B[A-Za-z0-9_-]{86}$' or coalesce(privada, '') !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Llaves inválidas.' using errcode = '22023';
  end if;
  if exists (select 1 from vault.secrets where name in ('melarlab_vapid_publica', 'melarlab_vapid_privada')) then
    return false;
  end if;
  perform vault.create_secret(privada, 'melarlab_vapid_privada', 'Llave privada VAPID de los avisos. La creó la función avisos.');
  perform vault.create_secret(publica, 'melarlab_vapid_publica', 'Llave pública VAPID de los avisos. La app la usa para suscribirse.');
  return true;
end;
$$;
comment on function public.guardar_llaves_avisos(text, text, text) is
  'Para la función avisos: guarda las llaves VAPID en el Vault la primera vez. Pide el secreto de los avisos.';

-- Las tres de arriba las llama la función avisos con la clave publicable (rol anon) y el secreto.
revoke all on function public.avisos_por_enviar(text, boolean) from public, anon, authenticated;
revoke all on function public.avisos_enviados(text, text[], text[]) from public, anon, authenticated;
revoke all on function public.guardar_llaves_avisos(text, text, text) from public, anon, authenticated;
grant execute on function public.avisos_por_enviar(text, boolean) to anon;
grant execute on function public.avisos_enviados(text, text[], text[]) to anon;
grant execute on function public.guardar_llaves_avisos(text, text, text) to anon;

-- La llave pública VAPID, para que la app suscriba el celular. Null mientras la función no la haya creado.
create or replace function public.llave_avisos()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'melarlab_vapid_publica'
$$;
revoke all on function public.llave_avisos() from public, anon, authenticated;
grant execute on function public.llave_avisos() to authenticated;

-- Llama a la función avisos con el secreto en el cuerpo (no en una cabecera, que podría quedar en los registros).
create or replace function privado.llamar_avisos(ultimo_intento boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secreto text := (select decrypted_secret from vault.decrypted_secrets where name = 'melarlab_avisos');
begin
  if base is null or secreto is null then
    raise exception 'Faltan project_url o melarlab_avisos en el Vault.';
  end if;
  return net.http_post(
    url := base || '/functions/v1/avisos',
    body := jsonb_build_object('secreto', secreto, 'ultimo_intento', ultimo_intento),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000);
end;
$$;
revoke all on function privado.llamar_avisos(boolean) from public, anon, authenticated;

-- De lunes a viernes, a las 6:00 y a las 6:30 de Honduras (12:00 y 12:30 UTC; Honduras no cambia de hora).
select cron.schedule('melarlab-aviso-mi-dia', '0 12 * * 1-5', 'select privado.llamar_avisos(false)');
select cron.schedule('melarlab-aviso-mi-dia-revision', '30 12 * * 1-5', 'select privado.llamar_avisos(true)');
