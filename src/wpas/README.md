# WPA: Nest + Worker BlueZone

Nest administra trabajos y resultados. El equipo Windows ejecuta BlueZone y el BAT. Nest ya no usa `spawn`, ni conoce rutas locales de Windows.

## Flujo

1. El cliente crea un job con `GET /wpa` o `POST /wpa/jobs`.
2. El worker Windows envía heartbeat y reclama atómicamente `GET /wpa/worker/jobs/next?workerId=BLUEZONE-01`.
3. BlueZone mantiene el login, menú, pantalla 502 y extracción WPA existentes.
4. El worker hace `POST /wpa/jobs/:jobId/sync`; Nest guarda los WPA y finaliza el job.

`WPA` sigue siendo la entidad de resultados por reservación. `WpaJob` sólo representa la ejecución y `WpaWorker` el heartbeat/estado.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/wpa?source=FILE` | Crea un job de desarrollo con `lista_reservaciones.txt`. |
| POST | `/wpa/jobs` | Crea un job; para HTTP recibe `{ "source": "HTTP", "reservations": ["22974515MX4"] }`. |
| GET | `/wpa/jobs/:jobId` | Consulta estado y resultado del job. |
| GET | `/wpa/results?jobId=:jobId` | Consulta el resultado de un job. Sin id devuelve el último terminado. |
| GET | `/wpa/workers` | Consulta heartbeat de workers. Un heartbeat de más de 90 segundos se considera no disponible al crear un job. |

Los endpoints `/wpa/worker/*` y `/wpa/jobs/:jobId/sync` son sólo para el worker. Protégelos con autenticación de servicio antes de exponerlos a Internet.

## Prueba local con Postman

1. Arranca Nest con MongoDB y verifica `GET http://localhost:3000/wpa/workers`.
2. En `worker/Script_Bluezone_a_Web (server).js`, configura `API_BASE_URL` con la URL alcanzable por la PC Windows. `localhost` sólo funciona si Nest y BlueZone están en la misma PC.
3. Confirma `archivoPath` y deja `source=FILE`; el contenido de `lista_reservaciones.txt` se conserva para desarrollo.
4. Crea el job: `GET http://localhost:3000/wpa?source=FILE`. Copia `jobId`.
5. Ejecuta `worker/lanzar_wpa.bat` una vez, o `worker/worker_loop.bat` para que consulte permanentemente. El job debe pasar de `PENDING` a `RUNNING` y terminar en `COMPLETED` o `ERROR`.
6. Consulta `GET http://localhost:3000/wpa/jobs/<jobId>` y revisa `result`.

Para probar la fuente HTTP sin cambiar BlueZone, manda:

```json
POST /wpa/jobs
{
  "source": "HTTP",
  "reservations": ["22974515MX4", "23175201US0"]
}
```

El script toma esas reservaciones de `GET /wpa/jobs/:jobId/reservations`. En producción, el siguiente paso es alimentar `reservations` desde tu fuente real (Mongo/API de reservaciones); el endpoint ya está preparado.

## Windows: worker permanente

Configura Task Scheduler para ejecutar `worker/worker_loop.bat` **al iniciar sesión** del usuario que tiene BlueZone. Selecciona ejecución interactiva; BlueZone es una aplicación gráfica y no debe depender de un servicio de Windows sin sesión.

El loop arranca BlueZone, ejecuta un solo job y vuelve a consultar cada 15 segundos. Cambia `POLL_SECONDS` si lo necesitas. `lanzar_wpa.bat` conserva su preparación de certificados, terminal y ejecución de BlueZone.

## Modo bajo demanda

Cuando no hay un worker con heartbeat reciente, `WorkerActivationService` registra que el job espera un worker y devuelve una respuesta explícita: no intenta ejecutar un BAT local.

Para completar este modo falta infraestructura externa: implementar en `worker-activation.service.ts` una llamada autenticada al proveedor que enciende la VM Windows (por ejemplo AWS EC2 `StartInstances`, Lightsail o un webhook interno). La VM debe iniciar sesión y Task Scheduler debe lanzar `worker_loop.bat`; cuando el worker envíe heartbeat, reclamará el job pendiente. No se incluyeron credenciales, IDs de instancia ni una dependencia AWS en el proyecto.
