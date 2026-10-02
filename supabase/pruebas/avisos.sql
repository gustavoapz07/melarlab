-- Prueba de seguridad de los avisos: la tabla avisos_push y las funciones de la base que usa la función avisos.
-- Se corre en el editor SQL de Supabase o con el conector. Simula:
--   anon: alguien sin cuenta, y también la función avisos (que llama con la clave publicable y el secreto),
--   A: el primer usuario real del proyecto, con la rutina de Mi Día,
--   B: otro usuario con cuenta (un id inventado).
-- Usa el secreto real de los avisos, pero lo lee del Vault aquí adentro: nunca sale de la base ni del resultado.
-- Todo pasa dentro de una sola transacción que termina con un error a propósito, así Postgres deshace todo
-- (las suscripciones y el Mi Día de prueba, y el Mi Día real de hoy que se aparta un momento). El mensaje del
-- error trae el resultado.
do $$
declare
  a uuid;
  b uuid := gen_random_uuid();
  secreto text;
  hoy constant date := (now() at time zone 'America/Tegucigalpa')::date;
  habil constant boolean := extract(isodow from (now() at time zone 'America/Tegucigalpa')::date) <= 5;
  base constant text := 'https://fcm.googleapis.com/fcm/send/prueba-' || replace(gen_random_uuid()::text, '-', '');
  e1 constant text := base || '-1';
  e2 constant text := base || '-2';
  p256dh constant text := 'B' || repeat('A', 86);
  auth constant text := repeat('Q', 22);
  habia_llaves boolean;
  bien int := 0;
  mal text[] := '{}';
  n int;
  r jsonb;
  texto text;
  dueno uuid;
  intento record;
begin
  select id into a from auth.users order by created_at limit 1;
  if a is null then
    raise exception 'Hace falta al menos un usuario en el proyecto para correr la prueba.';
  end if;
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'melarlab_avisos';
  if secreto is null then
    raise exception 'Falta el secreto melarlab_avisos en el Vault (migración 20261001235031_avisos).';
  end if;
  habia_llaves := exists (select 1 from vault.secrets where name = 'melarlab_vapid_privada');
  -- La prueba controla el Mi Día de hoy de A: el real se aparta y vuelve solo al deshacer la transacción.
  delete from public.mi_dia where usuario_id = a and fecha = hoy;

  -- 1. Sin cuenta: ni la tabla, ni la llave, ni las funciones sin el secreto.
  set local role anon;
  begin
    perform count(*) from public.avisos_push;
    mal := mal || 'sin cuenta se pudo leer avisos_push';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    insert into public.avisos_push (usuario_id, endpoint, p256dh, auth) values (a, e1, p256dh, auth);
    mal := mal || 'sin cuenta se pudo agregar una suscripción';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform public.llave_avisos();
    mal := mal || 'sin cuenta se pudo leer la llave pública';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  for intento in select * from (values ('sin secreto', null), ('secreto corto', 'corto'), ('secreto equivocado', secreto || 'x'),
      ('secreto casi igual', left(secreto, -1) || 'x')) as t(caso, valor) loop
    begin
      perform public.avisos_por_enviar(intento.valor, true);
      mal := mal || format('avisos_por_enviar respondió %s', intento.caso);
    exception when insufficient_privilege then bien := bien + 1;
    end;
  end loop;
  begin
    perform public.avisos_enviados(secreto || 'x', array[e1], null);
    mal := mal || 'avisos_enviados respondió con un secreto equivocado';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform public.guardar_llaves_avisos('x', 'B' || repeat('A', 86), repeat('A', 43));
    mal := mal || 'guardar_llaves_avisos respondió sin el secreto';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform privado.llamar_avisos(false);
    mal := mal || 'sin cuenta se pudo llamar a la función avisos';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  reset role;

  -- 2. A, con su cuenta: agrega su celular, lo ve, y no puede tocar lo que anota la función ni lo de otros.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.avisos_push (endpoint, p256dh, auth) values (e1, p256dh, auth) returning usuario_id into dueno;
  if dueno = a then bien := bien + 1; else mal := mal || 'la suscripción no quedó a nombre de A'; end if;
  insert into public.avisos_push (endpoint, p256dh, auth) values (e2, p256dh || '=', auth || '==');
  select count(*) into n from public.avisos_push where endpoint in (e1, e2);
  if n = 2 then bien := bien + 1; else mal := mal || format('A ve %s de sus 2 suscripciones', n); end if;
  begin
    insert into public.avisos_push (endpoint, p256dh, auth) values (e1, p256dh, auth);
    mal := mal || 'se repitió la misma suscripción';
  exception when unique_violation then bien := bien + 1;
  end;
  begin
    update public.avisos_push set ultimo_aviso = hoy where endpoint = e1;
    mal := mal || 'A cambió ultimo_aviso';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    insert into public.avisos_push (usuario_id, endpoint, p256dh, auth) values (b, base || '-b', p256dh, auth);
    mal := mal || 'A agregó una suscripción a nombre de B';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  for intento in select * from (values
      ('un endpoint sin https', 'http://fcm.googleapis.com/fcm/send/x', p256dh, auth),
      ('un endpoint de otro sitio', 'https://ejemplo.com/push/x', p256dh, auth),
      ('un dominio parecido', 'https://fcm.googleapis.com.ejemplo.com/x', p256dh, auth),
      ('el propio Supabase', 'https://xvmezwvpmveruhfurkxf.supabase.co/rest/v1/x', p256dh, auth),
      ('un endpoint enorme', 'https://fcm.googleapis.com/fcm/send/' || repeat('x', 1000), p256dh, auth),
      ('una llave del celular corta', base || '-c', 'BAAA', auth),
      ('una llave con otros símbolos', base || '-d', 'B' || repeat('A', 85) || '+', auth),
      ('un secreto del celular corto', base || '-e', p256dh, 'QQQ')) as t(caso, endpoint, llave, secreto_cel) loop
    begin
      insert into public.avisos_push (endpoint, p256dh, auth) values (intento.endpoint, intento.llave, intento.secreto_cel);
      mal := mal || format('aceptó %s', intento.caso);
    exception when check_violation then bien := bien + 1;
    end;
  end loop;
  -- Hasta 10 celulares: se intenta agregar 12 y se queda en 10.
  for i in 1..12 loop
    begin
      insert into public.avisos_push (endpoint, p256dh, auth) values (base || '-tope-' || i, p256dh, auth);
    exception when check_violation then exit;
    end;
  end loop;
  select count(*) into n from public.avisos_push;
  if n = 10 then bien := bien + 1; else mal := mal || format('el tope dejó %s celulares', n); end if;
  begin
    perform public.avisos_por_enviar(secreto, false);
    mal := mal || 'un usuario con cuenta pudo llamar a avisos_por_enviar';
  exception when insufficient_privilege then bien := bien + 1;
  end;
  begin
    perform public.llave_avisos();
    bien := bien + 1;
  exception when others then mal := mal || 'A no pudo leer la llave pública';
  end;

  -- 3. B no ve ni borra los celulares de A.
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.avisos_push;
  if n = 0 then bien := bien + 1; else mal := mal || format('B ve %s suscripciones ajenas', n); end if;
  delete from public.avisos_push where endpoint = e1;
  reset role;
  if exists (select 1 from public.avisos_push where endpoint = e1) then bien := bien + 1; else mal := mal || 'B borró un celular de A'; end if;
  -- Para lo que sigue, A se queda con sus dos celulares de prueba.
  delete from public.avisos_push where usuario_id = a and endpoint like base || '-tope-%';

  -- 4. Qué se manda (la función avisos llama como anon, con el secreto).
  set local role anon;
  r := public.avisos_por_enviar(secreto, false);
  if (r ->> 'fecha')::date = hoy then bien := bien + 1; else mal := mal || format('la fecha salió %s', r ->> 'fecha'); end if;
  if (r -> 'llaves' is not null and jsonb_typeof(r -> 'llaves') = 'object') = habia_llaves then bien := bien + 1;
  else mal := mal || 'las llaves no coinciden con las del Vault'; end if;
  select count(*) into n from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' like base || '%';
  if n = 0 then bien := bien + 1; else mal := mal || format('a las 6:00 sin Mi Día salieron %s avisos', n); end if;

  r := public.avisos_por_enviar(secreto, true);
  select count(*), min(x -> 'aviso' ->> 'titulo') into n, texto from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' like base || '%';
  if habil then
    if n = 2 and texto = 'Mi Día no llegó' then bien := bien + 1; else mal := mal || format('a las 6:30 sin Mi Día salieron %s avisos (%s)', n, texto); end if;
  else
    if n = 0 then bien := bien + 1; else mal := mal || format('en fin de semana sin Mi Día salieron %s avisos', n); end if;
  end if;
  reset role;

  -- "No llegó" solo va a quien tiene la rutina de Mi Día.
  delete from privado.publicadores_mi_dia where usuario_id = a;
  set local role anon;
  r := public.avisos_por_enviar(secreto, true);
  select count(*) into n from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' like base || '%';
  if n = 0 then bien := bien + 1; else mal := mal || 'avisó "no llegó" a quien no tiene la rutina'; end if;
  reset role;

  -- Con el Mi Día de hoy: "Mi Día" con su titular, a los dos celulares.
  insert into public.mi_dia (usuario_id, fecha, datos) values (a, hoy, jsonb_build_object('fecha', hoy, 'titular', '  Titular de prueba  '));
  set local role anon;
  r := public.avisos_por_enviar(secreto, false);
  select count(*), min(x -> 'aviso' ->> 'texto') into n, texto from jsonb_array_elements(r -> 'avisos') x
    where x ->> 'endpoint' like base || '%' and x -> 'aviso' ->> 'titulo' = 'Mi Día' and x -> 'aviso' ->> 'url' = '/' and x ->> 'p256dh' is not null;
  if n = 2 and texto = 'Titular de prueba' then bien := bien + 1; else mal := mal || format('con Mi Día salieron %s avisos (%s)', n, texto); end if;
  reset role;

  -- Sin titular o con uno larguísimo.
  update public.mi_dia set datos = jsonb_build_object('fecha', hoy) where usuario_id = a and fecha = hoy;
  set local role anon;
  r := public.avisos_por_enviar(secreto, false);
  select min(x -> 'aviso' ->> 'texto') into texto from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' = e1;
  if texto = 'Tu Mi Día de hoy está listo.' then bien := bien + 1; else mal := mal || format('sin titular el aviso dice %s', texto); end if;
  reset role;
  update public.mi_dia set datos = jsonb_build_object('fecha', hoy, 'titular', repeat('a', 300)) where usuario_id = a and fecha = hoy;
  set local role anon;
  r := public.avisos_por_enviar(secreto, false);
  select min(char_length(x -> 'aviso' ->> 'texto')) into n from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' = e1;
  if n = 200 then bien := bien + 1; else mal := mal || format('el titular largo quedó de %s caracteres', n); end if;

  -- 5. Lo que pasó al mandar: a e1 le llegó (no se repite hoy) y e2 ya no existe (se borra).
  n := public.avisos_enviados(secreto, array[e1], array[e2]);
  if n = 2 then bien := bien + 1; else mal := mal || format('avisos_enviados cambió %s filas', n); end if;
  r := public.avisos_por_enviar(secreto, true);
  select count(*) into n from jsonb_array_elements(r -> 'avisos') x where x ->> 'endpoint' like base || '%';
  if n = 0 then bien := bien + 1; else mal := mal || format('después de mandar quedaron %s avisos pendientes', n); end if;
  reset role;
  select count(*) into n from public.avisos_push where endpoint = e2;
  if n = 0 then bien := bien + 1; else mal := mal || 'la suscripción vencida no se borró'; end if;
  select count(*) into n from public.avisos_push where endpoint = e1 and ultimo_aviso = hoy;
  if n = 1 then bien := bien + 1; else mal := mal || 'no quedó anotado el aviso de hoy'; end if;

  -- 6. Las llaves VAPID: se validan y, si ya hay, no se cambian.
  set local role anon;
  for intento in select * from (values ('una pública corta', 'BAAA', repeat('A', 43)), ('una pública que no empieza en B', 'C' || repeat('A', 86), repeat('A', 43)),
      ('una privada corta', 'B' || repeat('A', 86), 'AAAA'), ('una privada con otros símbolos', 'B' || repeat('A', 86), repeat('A', 42) || '/')) as t(caso, publica, privada) loop
    begin
      perform public.guardar_llaves_avisos(secreto, intento.publica, intento.privada);
      mal := mal || format('aceptó %s', intento.caso);
    exception when invalid_parameter_value then bien := bien + 1;
    end;
  end loop;
  if public.guardar_llaves_avisos(secreto, 'B' || repeat('A', 86), repeat('A', 43)) = not habia_llaves then bien := bien + 1;
  else mal := mal || 'guardar_llaves_avisos no respetó las llaves que ya había'; end if;
  if not public.guardar_llaves_avisos(secreto, 'B' || repeat('B', 86), repeat('B', 43)) then bien := bien + 1;
  else mal := mal || 'las llaves se cambiaron una segunda vez'; end if;
  reset role;

  -- 7. Cron: los dos llamados de lunes a viernes.
  select count(*) into n from cron.job where (jobname, schedule, command) in (
    ('melarlab-aviso-mi-dia', '0 12 * * 1-5', 'select privado.llamar_avisos(false)'),
    ('melarlab-aviso-mi-dia-revision', '30 12 * * 1-5', 'select privado.llamar_avisos(true)'));
  if n = 2 then bien := bien + 1; else mal := mal || format('hay %s de los 2 llamados de Cron', n); end if;

  raise exception 'RESULTADO: % bien, % mal%', bien, cardinality(mal),
    case when cardinality(mal) > 0 then E'\n- ' || array_to_string(mal, E'\n- ') else '' end;
end;
$$;
