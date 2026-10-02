-- pg_net en el esquema extensions, no en public (aviso "Extension in Public" del revisor de Supabase).
-- pg_net no se puede mover con ALTER EXTENSION: se quita y se vuelve a crear. Sus funciones siguen en el esquema
-- net (net.http_post), así que privado.llamar_avisos no cambia. Solo se pierden las respuestas guardadas de las
-- últimas horas (net._http_response), que sirven para revisar y se borran solas a las 6 horas.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
