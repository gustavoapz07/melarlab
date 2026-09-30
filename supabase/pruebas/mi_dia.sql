-- Prueba de seguridad de Mi Día: la tabla mi_dia y la función publicar_mi_dia().
-- Se corre en el editor SQL de Supabase o con el conector. Simula:
--   la rutina, que llama a la función sin cuenta (anon) y con el secreto en la cabecera,
--   A: el primer usuario real del proyecto, dueño del Mi Día,
--   B: otro usuario con cuenta (un id inventado).
-- El secreto de la prueba se inventa aquí mismo: nunca se usa el real. Todo pasa dentro de una sola
-- transacción que termina con un error a propósito, así Postgres deshace todo y no queda nada.
-- El mensaje del error trae el resultado.
do $$
declare
  a uuid;
  b uuid := gen_random_uuid();
  secreto constant text := 'prueba-' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  hoy constant date := (now() at time zone 'America/Tegucigalpa')::date;
  bien int := 0;
  mal text[] := '{}';
  n int;
  dia date;
  titular text;
  intento record;
begin
  select id into a from auth.users order by created_at limit 1;
  if a is null then
    raise exception 'Hace falta al menos un usuario en el proyecto para correr la prueba.';
  end if;

  -- El publicador de prueba de A, con la huella del secreto inventado.
  insert into privado.publicadores_mi_dia (usuario_id, huella, nombre)
    values (a, encode(sha256(convert_to(secreto, 'UTF8')), 'hex'), 'Prueba')
    on conflict (usuario_id) do update set huella = excluded.huella;

  -- 1. La rutina, sin cuenta (anon).
  set local role anon;

  -- Sin secreto, con uno corto y con uno equivocado: no entra.
  for intento in select * from (values
      ('sin cabecera', '{}'),
      ('secreto corto', '{"x-melarlab-secreto": "corto"}'),
      ('secreto equivocado', json_build_object('x-melarlab-secreto', secreto || 'x')::text)) as t(caso, cabeceras) loop
    perform set_config('request.headers', intento.cabeceras, true);
    begin
      perform public.publicar_mi_dia(jsonb_build_object('fecha', hoy::text, 'titular', 'Intruso'));
      mal := mal || format('entró con %s', intento.caso);
    exception when insufficient_privilege then bien := bien + 1;
    end;
  end loop;

  -- Con el secreto correcto: publica a nombre de A y devuelve el día.
  perform set_config('request.headers', json_build_object('x-melarlab-secreto', secreto)::text, true);
  dia := public.publicar_mi_dia(jsonb_build_object('fecha', hoy::text, 'titular', 'Primera versión', 'ia', '[]'::jsonb));
  if dia = hoy then bien := bien + 1; else mal := mal || format('devolvió %s en vez de %s', dia, hoy); end if;

  -- Publicar otra vez el mismo día reemplaza, no duplica.
  perform public.publicar_mi_dia(jsonb_build_object('fecha', hoy::text, 'titular', 'Segunda versión'));

  -- Datos inválidos: se rechazan aunque el secreto sea correcto.
  for intento in select * from (values
      ('una lista en vez de un objeto', '[1, 2]'),
      ('sin fecha', '{"titular": "x"}'),
      ('fecha sin formato', '{"fecha": "mañana"}'),
      ('fecha imposible', '{"fecha": "2026-02-30"}'),
      ('fecha lejana', json_build_object('fecha', (hoy + 5)::text)::text),
      ('clave desconocida', json_build_object('fecha', hoy::text, 'script', '<script>')::text),
      ('sección que no es lista', json_build_object('fecha', hoy::text, 'eventos_hoy', 'hoy nada')::text),
      ('lista demasiado larga', json_build_object('fecha', hoy::text, 'ia', (select jsonb_agg(i) from generate_series(1, 51) i))::text),
      ('titular demasiado largo', json_build_object('fecha', hoy::text, 'titular', repeat('a', 301))::text),
      ('JSON demasiado grande', json_build_object('fecha', hoy::text, 'fuentes', jsonb_build_array(repeat('a', 100001)))::text)
    ) as t(caso, datos) loop
    begin
      perform public.publicar_mi_dia(intento.datos::jsonb);
      mal := mal || format('aceptó %s', intento.caso);
    exception when invalid_parameter_value then bien := bien + 1;
    end;
  end loop;

  -- Sin cuenta no se lee la tabla ni el esquema privado.
  begin
    perform count(*) from public.mi_dia;
    mal := mal || 'sin cuenta se pudo leer mi_dia';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform count(*) from privado.publicadores_mi_dia;
    mal := mal || 'sin cuenta se pudo leer las huellas';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  reset role;

  -- 2. A, con su cuenta: ve su Mi Día (uno solo, con la segunda versión) y no puede escribirlo directo.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*), max(datos ->> 'titular') into n, titular from public.mi_dia where fecha = hoy;
  if n = 1 then bien := bien + 1; else mal := mal || format('A ve %s Mi Día de hoy', n); end if;
  if titular = 'Segunda versión' then bien := bien + 1; else mal := mal || format('el titular quedó "%s"', titular); end if;
  begin
    insert into public.mi_dia (usuario_id, fecha, datos) values (a, hoy - 1, '{}');
    mal := mal || 'A escribió directo en mi_dia';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    update public.mi_dia set datos = '{}' where fecha = hoy;
    mal := mal || 'A cambió directo su Mi Día';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    delete from public.mi_dia where fecha = hoy;
    mal := mal || 'A borró directo su Mi Día';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  -- Con cuenta tampoco se usa la función: es solo para la rutina.
  begin
    perform public.publicar_mi_dia(jsonb_build_object('fecha', hoy::text));
    mal := mal || 'un usuario con cuenta pudo llamar a la función';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform count(*) from privado.publicadores_mi_dia;
    mal := mal || 'con cuenta se pudo leer las huellas';
  exception when insufficient_privilege then bien := bien + 1;
  end;

  -- 3. B no ve el Mi Día de A.
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.mi_dia;
  if n = 0 then bien := bien + 1; else mal := mal || format('B ve %s Mi Día ajenos', n); end if;
  reset role;

  raise exception 'RESULTADO: % bien, % mal%', bien, cardinality(mal),
    case when cardinality(mal) > 0 then E'\n- ' || array_to_string(mal, E'\n- ') else '' end;
end;
$$;
