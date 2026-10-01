-- Prueba de seguridad del Radar: la tabla radar y la función publicar_radar().
-- Se corre en el editor SQL de Supabase o con el conector. Simula:
--   la rutina, que llama a la función sin cuenta (anon) y con el secreto en la cabecera,
--   A: el primer usuario real del proyecto, dueño del Radar,
--   B: otro usuario con cuenta (un id inventado).
-- El secreto de la prueba se inventa aquí mismo: nunca se usa el real. Todo pasa dentro de una sola
-- transacción que termina con un error a propósito, así Postgres deshace todo y no queda nada (tampoco
-- el cambio de huella de la prueba). El mensaje del error trae el resultado.
do $$
declare
  a uuid;
  b uuid := gen_random_uuid();
  secreto constant text := 'prueba-' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  hoy constant date := (now() at time zone 'America/Tegucigalpa')::date;
  novedad constant jsonb := jsonb_build_array(jsonb_build_object('titulo', 'Una novedad', 'enlace', 'https://www.anthropic.com/news'));
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

  -- El publicador de prueba de A, con la huella del secreto inventado (el mismo registro que usa Mi Día).
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
      perform public.publicar_radar(jsonb_build_object('fecha', hoy::text, 'novedades', novedad));
      mal := mal || format('entró con %s', intento.caso);
    exception when insufficient_privilege then bien := bien + 1;
    end;
  end loop;

  -- Con el secreto correcto: publica a nombre de A y devuelve el día.
  perform set_config('request.headers', json_build_object('x-melarlab-secreto', secreto)::text, true);
  dia := public.publicar_radar(jsonb_build_object('fecha', hoy::text, 'titular', 'Primera versión', 'novedades', novedad));
  if dia = hoy then bien := bien + 1; else mal := mal || format('devolvió %s en vez de %s', dia, hoy); end if;

  -- Publicar otra vez el mismo día reemplaza, no duplica. Un Radar de hace 6 días también entra.
  perform public.publicar_radar(jsonb_build_object('fecha', hoy::text, 'titular', 'Segunda versión', 'novedades', novedad));
  dia := public.publicar_radar(jsonb_build_object('fecha', (hoy - 6)::text, 'novedades', novedad));
  if dia = hoy - 6 then bien := bien + 1; else mal := mal || 'no aceptó el Radar de hace 6 días'; end if;

  -- Datos inválidos: se rechazan aunque el secreto sea correcto.
  for intento in select * from (values
      ('una lista en vez de un objeto', '[1, 2]'),
      ('sin fecha', json_build_object('novedades', novedad)::text),
      ('fecha sin formato', json_build_object('fecha', 'domingo', 'novedades', novedad)::text),
      ('fecha imposible', json_build_object('fecha', '2026-02-30', 'novedades', novedad)::text),
      ('fecha de hace más de una semana', json_build_object('fecha', (hoy - 8)::text, 'novedades', novedad)::text),
      ('fecha lejana', json_build_object('fecha', (hoy + 3)::text, 'novedades', novedad)::text),
      ('sin novedades', json_build_object('fecha', hoy::text)::text),
      ('novedades vacías', json_build_object('fecha', hoy::text, 'novedades', '[]'::jsonb)::text),
      ('demasiadas novedades', json_build_object('fecha', hoy::text, 'novedades', (select jsonb_agg(i) from generate_series(1, 13) i))::text),
      ('clave desconocida', json_build_object('fecha', hoy::text, 'novedades', novedad, 'script', '<script>')::text),
      ('probar que no es objeto', json_build_object('fecha', hoy::text, 'novedades', novedad, 'probar', 'algo')::text),
      ('fuentes que no son lista', json_build_object('fecha', hoy::text, 'novedades', novedad, 'fuentes', 'una')::text),
      ('titular demasiado largo', json_build_object('fecha', hoy::text, 'novedades', novedad, 'titular', repeat('a', 301))::text),
      ('JSON demasiado grande', json_build_object('fecha', hoy::text, 'novedades', jsonb_build_array(repeat('a', 100001)))::text)
    ) as t(caso, datos) loop
    begin
      perform public.publicar_radar(intento.datos::jsonb);
      mal := mal || format('aceptó %s', intento.caso);
    exception when invalid_parameter_value then bien := bien + 1;
    end;
  end loop;

  -- Sin cuenta no se lee la tabla.
  begin
    perform count(*) from public.radar;
    mal := mal || 'sin cuenta se pudo leer radar';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  reset role;

  -- 2. A, con su cuenta: ve su Radar (uno por fecha, con la segunda versión) y no puede escribirlo directo.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*), max(datos ->> 'titular') into n, titular from public.radar where fecha = hoy;
  if n = 1 then bien := bien + 1; else mal := mal || format('A ve %s Radar de hoy', n); end if;
  if titular = 'Segunda versión' then bien := bien + 1; else mal := mal || format('el titular quedó "%s"', titular); end if;
  begin
    insert into public.radar (usuario_id, fecha, datos) values (a, hoy - 1, '{}');
    mal := mal || 'A escribió directo en radar';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    update public.radar set datos = '{}' where fecha = hoy;
    mal := mal || 'A cambió directo su Radar';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    delete from public.radar where fecha = hoy;
    mal := mal || 'A borró directo su Radar';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  -- Con cuenta tampoco se usa la función: es solo para la rutina.
  begin
    perform public.publicar_radar(jsonb_build_object('fecha', hoy::text, 'novedades', novedad));
    mal := mal || 'un usuario con cuenta pudo llamar a la función';
  exception when insufficient_privilege then bien := bien + 1;
  end;

  -- 3. B no ve el Radar de A.
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.radar;
  if n = 0 then bien := bien + 1; else mal := mal || format('B ve %s Radar ajenos', n); end if;
  reset role;

  raise exception 'RESULTADO: % bien, % mal%', bien, cardinality(mal),
    case when cardinality(mal) > 0 then E'\n- ' || array_to_string(mal, E'\n- ') else '' end;
end;
$$;
