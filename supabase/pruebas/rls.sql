-- Prueba de seguridad de las tablas de los módulos (RLS, permisos y validaciones).
-- Se corre en el editor SQL de Supabase o con el conector. Simula tres visitantes:
--   A: el primer usuario real del proyecto (sus filas de prueba se borran solas al final),
--   B: otro usuario con cuenta (un id inventado),
--   anon: alguien sin cuenta.
-- Todo pasa dentro de una sola transacción que termina con un error a propósito: así Postgres
-- deshace todo y no queda ningún dato de prueba. El mensaje del error trae el resultado.
do $$
declare
  a uuid;
  b uuid := gen_random_uuid();
  bien int := 0;
  mal text[] := '{}';
  n int;
  id_a uuid;
  dueno uuid;
  horas numeric;
  marca timestamptz;
  t text;
  valores text;
  ejemplos constant jsonb := jsonb_build_object(
    'pendientes',   $v$(tarea) values ('Prueba RLS')$v$,
    'estudios',     $v$(periodo, codigo, asignatura) values (1, 'PRB-001', 'Prueba RLS')$v$,
    'billetera',    $v$(fecha, tipo, monto, categoria) values (current_date, 'gasto', 150, 'comida')$v$,
    'gym',          $v$(fecha, rutina) values (current_date, 'Prueba RLS')$v$,
    'gym_plan',     $v$(dia, rutina) values (1, 'Prueba RLS')$v$,
    'comidas',      $v$(fecha, momento, comida) values (current_date, 'almuerzo', 'Prueba RLS')$v$,
    'descanso',     $v$(fecha, me_dormi, me_desperte) values (current_date, '23:30', '06:00')$v$,
    'lista_deseos', $v$(producto) values ('Prueba RLS')$v$,
    'clientes',     $v$(negocio) values ('Prueba RLS')$v$,
    'contenido',    $v$(idea) values ('Prueba RLS')$v$
  );
  invalidos constant text[] := array[
    $v$insert into public.billetera (fecha, tipo, monto, categoria) values (current_date, 'gasto', -5, 'comida')$v$,
    $v$insert into public.billetera (fecha, tipo, monto, categoria) values (current_date, 'gasto', 5, 'casino')$v$,
    $v$insert into public.lista_deseos (producto, enlace) values ('x', 'javascript:alert(1)')$v$,
    $v$insert into public.lista_deseos (producto, enlace) values ('x', 'http://sin-cifrar.com')$v$,
    $v$insert into public.contenido (idea, redes) values ('x', '{myspace}')$v$,
    $v$insert into public.pendientes (tarea) values ('   ')$v$,
    $v$insert into public.pendientes (tarea, estado) values ('x', 'olvidado')$v$,
    $v$insert into public.descanso (fecha, me_dormi, me_desperte, calidad) values (current_date, '23:00', '07:00', 7)$v$,
    $v$insert into public.estudios (periodo, codigo, asignatura, nota_final) values (1, 'X', 'x', 101)$v$,
    $v$insert into public.gym (fecha, rutina, duracion_min) values (current_date, 'x', 0)$v$,
    $v$insert into public.gym_plan (dia, rutina) values (8, 'x')$v$,
    $v$insert into public.gym_plan (dia, rutina) values (2, '   ')$v$
  ];
  sql text;
begin
  select id into a from auth.users order by created_at limit 1;
  if a is null then
    raise exception 'Hace falta al menos un usuario en el proyecto para correr la prueba.';
  end if;

  foreach t in array array['pendientes', 'estudios', 'billetera', 'gym', 'gym_plan', 'comidas', 'descanso', 'lista_deseos', 'clientes', 'contenido'] loop
    valores := ejemplos ->> t;

    -- A agrega una fila sin decir de quién es: queda a su nombre.
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', a::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    execute format('insert into public.%I %s returning id, usuario_id', t, valores) into id_a, dueno;
    if dueno = a then bien := bien + 1; else mal := mal || format('%s: la fila no quedó a nombre de A', t); end if;

    execute format('select count(*) from public.%I where id = $1', t) into n using id_a;
    if n = 1 then bien := bien + 1; else mal := mal || format('%s: A no ve su fila', t); end if;

    -- A no puede pasarle su fila a B.
    begin
      execute format('update public.%I set usuario_id = $1 where id = $2', t) using b, id_a;
      mal := mal || format('%s: A pudo pasarle su fila a B', t);
    exception when insufficient_privilege then bien := bien + 1;
    end;

    -- La fecha de "actualizado" se pone sola.
    execute format('update public.%I set actualizado = %L where id = $1 returning actualizado', t, '2000-01-01') into marca using id_a;
    if marca > '2000-01-01' then bien := bien + 1; else mal := mal || format('%s: no se marcó la hora del cambio', t); end if;

    -- B no ve, no cambia y no borra lo de A.
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 then bien := bien + 1; else mal := mal || format('%s: B ve %s filas ajenas', t, n); end if;
    execute format('update public.%I set actualizado = now() where id = $1', t) using id_a;
    get diagnostics n = row_count;
    if n = 0 then bien := bien + 1; else mal := mal || format('%s: B cambió una fila de A', t); end if;
    execute format('update public.%I set usuario_id = $1 where id = $2', t) using b, id_a;
    get diagnostics n = row_count;
    if n = 0 then bien := bien + 1; else mal := mal || format('%s: B se adueñó de una fila de A', t); end if;
    execute format('delete from public.%I where id = $1', t) using id_a;
    get diagnostics n = row_count;
    if n = 0 then bien := bien + 1; else mal := mal || format('%s: B borró una fila de A', t); end if;

    -- B no puede agregar filas a nombre de A.
    begin
      execute format('insert into public.%I %s', t,
        regexp_replace(valores, '^\((.*)\) values \((.*)\)$', format('(\1, usuario_id) values (\2, %L)', a)));
      mal := mal || format('%s: B agregó una fila a nombre de A', t);
    exception when insufficient_privilege then bien := bien + 1;
    end;

    -- Con cuenta tampoco se puede vaciar la tabla entera (TRUNCATE no pasa por RLS).
    begin
      execute format('truncate public.%I', t);
      mal := mal || format('%s: se pudo vaciar la tabla', t);
    exception when insufficient_privilege then bien := bien + 1;
    end;

    -- Sin cuenta: nada.
    reset role;
    set local role anon;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    begin
      execute format('select count(*) from public.%I', t) into n;
      mal := mal || format('%s: sin cuenta se pudo leer', t);
    exception when insufficient_privilege then bien := bien + 1;
    end;
    begin
      execute format('insert into public.%I %s', t, valores);
      mal := mal || format('%s: sin cuenta se pudo escribir', t);
    exception when insufficient_privilege then bien := bien + 1;
    end;
    reset role;
  end loop;

  -- Validaciones: datos inválidos se rechazan aunque vengan de una cuenta válida.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  foreach sql in array invalidos loop
    begin
      execute sql;
      mal := mal || format('se aceptó un dato inválido: %s', sql);
    exception when check_violation then bien := bien + 1;
    end;
  end loop;

  -- Horas dormidas cruzando la medianoche.
  insert into public.descanso (fecha, me_dormi, me_desperte) values (current_date, '23:30', '06:00') returning horas_dormidas into horas;
  if horas = 6.50 then bien := bien + 1; else mal := mal || format('23:30 a 06:00 dio %s horas', horas); end if;
  insert into public.descanso (fecha, me_dormi, me_desperte) values (current_date, '00:30', '07:15') returning horas_dormidas into horas;
  if horas = 6.75 then bien := bien + 1; else mal := mal || format('00:30 a 07:15 dio %s horas', horas); end if;

  -- Plan de gym: un solo plan por día de la semana para cada usuario.
  insert into public.gym_plan (dia, rutina) values (3, 'Pierna');
  begin
    insert into public.gym_plan (dia, rutina) values (3, 'Otra rutina el mismo día');
    mal := mal || 'gym_plan: se aceptaron dos rutinas para el mismo día';
  exception when unique_violation then bien := bien + 1;
  end;
  reset role;

  raise exception 'RESULTADO: % bien, % mal%', bien, cardinality(mal),
    case when cardinality(mal) > 0 then E'\n- ' || array_to_string(mal, E'\n- ') else '' end;
end;
$$;
