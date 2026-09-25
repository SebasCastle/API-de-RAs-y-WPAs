# Modulo WPAS

Prefijo global de Nest: **`/api/sync`**. Base local: `http://localhost:3000/api/sync`.

WPAS extrae **WPA** de reservaciones Avis en BlueZone (pantalla 502). Nest guarda jobs, logs y resultados. El BAT descarga desde Nest el script y `config.env` si no estan locales. **`bzw2h.bzlp` no se descarga nunca**: debe estar junto al BAT o en `D:\Downloads`.

## Flujo

1. El cliente crea un job por **JSON (HTTP)** o **archivo `.txt` (FILE)**. Un job usa un solo modo.
2. Nest guarda el job en `wpa_jobs` con `status=PENDING` y las reservaciones validadas (`24388509MX5` = 8 digitos + 2 letras + 1 digito).
3. Si no hay worker reciente, Nest intenta arrancar `Lanzador_Bluezone.bat` (`WPAS_ACTIVATION_MODE=LOCAL` y `BLUEZONE_BAT_PATH`).
4. El BAT crea `BlueZone\Scripts` si falta. Si no hay script o `config.env` locales, los baja de Nest y los copia a Scripts. `bzw2h.bzlp` solo se busca en local (junto al BAT o `D:\Downloads`); si no esta, error y termina.
5. El JS reclama el job, entra a pantalla 502, pide reservaciones a Nest, extrae WPAs y hace **`POST /wpa/jobs/:jobId/sync`**. Ahi se llena `wpa_jobs.result` y las filas de `wpas`.
6. El cliente consulta **`GET /wpa/jobs/:jobId`**: estado del job + arreglo `results` con cada WPA.

Jobs viejos marcados `COMPLETED` con `result` NULL no tienen WPAs guardados. Hay que volver a procesarlos despues de que el JS sincronice bien.

## Archivos del worker

| Recurso | Origen | Destino en Windows |
|---|---|---|
| `script.js` | `GET /wpa/worker/resources/script.js` (si no esta junto al BAT) | Copia a `...\BlueZone\Scripts\Script_Bluezone_a_Web (server)_AWS.js` |
| `config.env` | `GET /wpa/worker/resources/config.env` (si no esta en `worker\config`) | Copia a `...\BlueZone\Scripts\config.env` |
| `Lanzador_Bluezone.bat` | `GET /wpa/worker/resources/Lanzador_Bluezone.bat` | Disponible para instalar el launcher; el BAT en ejecucion no se auto-reemplaza |
| `bzw2h.bzlp` | **Solo local.** Nest responde 400 si se pide. | Junto al BAT o `D:\Downloads\bzw2h.bzlp` (se puede copiar de Downloads al folder del BAT) |
| `BZMD.PRO` | Instalacion BlueZone | `%USERPROFILE%\AppData\Local\Temp\BlueZone\7.1\` |

`config.env` minimo:

```env
USERNAME=...
PASSWORD=...
WPAS_API_BASE=http://localhost:3000/api/sync
WORKER_ID=
```

Si `WORKER_ID` esta vacio, BAT y JS usan `%COMPUTERNAME%`.

`AWS_AUTO_SHUTDOWN` en el BAT: `0` = pruebas (avisa apagado y sigue el loop). `1` = el BAT termina tras idle de 30s.

## Tablas

- **`wpa_jobs`**: id, source (`HTTP`/`FILE`), reservations (JSON), status, worker_id, fechas, **result** (payload del sync).
- **`wpas`**: un WPA por `res_num`, con `job_id` del ultimo job que lo actualizo.
- **`wpa_workers`**: heartbeat / status (`ONLINE`, `STARTING`, `RUNNING`, `BUSY`, `COMPLETED`, `IDLE`, `OFFLINE`, `ERROR`).
- **`wpa_worker_logs`**: logs del BAT y del JS.

## Endpoints de cliente

| Metodo | Ruta | Uso |
|---|---|---|
| `POST` | `/wpa/jobs` | Crea job. JSON **o** multipart `.txt`, no ambos. |
| `GET` | `/wpa/jobs/:jobId` | Job + `reservations` + `stats` + **`results[]`** (`reservacion`, `wpa`, `status`). |
| `GET` | `/wpa/worker/logs` | Logs en BD. Query: `limit` (1-500), `level` (`INFO`/`ERROR`/…). |
| `GET` | `/wpa/worker/status?workerId=` | Estado de un worker y si hay pendientes. |
| `GET` | `/wpa/workers` | Lista de workers (heartbeat). |

### Crear job JSON

```http
POST /api/sync/wpa/jobs
Content-Type: application/json

{
  "source": "HTTP",
  "reservations": ["24388509MX5", "24492636MX0"]
}
```

### Crear job archivo

`multipart/form-data`: campo `source=FILE` y campo `file` = `.txt` con una reservacion por linea.

Respuesta de alta:

```json
{ "status": "pending", "jobId": 14, "source": "HTTP", "activation": { } }
```

### Consultar WPAs de un job

```http
GET /api/sync/wpa/jobs/14
```

```json
{
  "jobId": 14,
  "source": "HTTP",
  "status": "COMPLETED",
  "workerId": "BLUEZONE-01",
  "reservations": ["24388509MX5"],
  "stats": { "total": 1, "correctos": 1, "noEncontrados": 0, "errores": 0 },
  "message": "Proceso completado correctamente.",
  "results": [
    { "reservacion": "24388509MX5", "wpa": "ABC123", "status": "OK" }
  ]
}
```

## Endpoints del worker (necesarios para el BAT/JS)

| Metodo | Ruta | Uso |
|---|---|---|
| `POST` | `/wpa/worker/heartbeat` | BAT/JS: `workerId`, `status`, opcional `jobId`. |
| `GET` | `/wpa/worker/jobs/pending` | BAT: hay jobs `PENDING`. |
| `GET` | `/wpa/worker/jobs/next?workerId=` | JS: reclama el siguiente job (transaccion). |
| `GET` | `/wpa/jobs/:jobId/reservations` | JS en pantalla 502: `{ source, reservations }`. |
| `POST` | `/wpa/jobs/:jobId/sync` | JS: guarda WPAs en `wpas` y `wpa_jobs.result`. |
| `POST` | `/wpa/worker/logs` | BAT y JS. |
| `POST` | `/wpa/worker/failure` | BAT: error fatal / archivo no encontrado / JS fallido. |
| `POST` | `/wpa/worker/shutdown` | BAT: idle 30s, aviso de apagado. |
| `GET` | `/wpa/worker/resources/script.js` | Descarga el JS BlueZone. |
| `GET` | `/wpa/worker/resources/config.env` | Descarga credenciales/config del worker. |
| `GET` | `/wpa/worker/resources/Lanzador_Bluezone.bat` | Descarga el launcher. |
| `GET` | `/wpa/worker/resources/bzw2h.bzlp` | **No permitido** (400). El perfil Web-to-Host es solo local. |

Body de sync (el JS lo arma):

```json
{
  "status": "success",
  "errorCode": 0,
  "message": "Proceso completado correctamente.",
  "stats": { "total": 2, "correctos": 2, "noEncontrados": 0, "errores": 0 },
  "results": [
    { "reservacion": "24388509MX5", "wpa": "...", "status": "OK" }
  ]
}
```

`status` del payload `success` deja el job en `COMPLETED`; cualquier otro valor en `ERROR`.

## Variables Nest (`.env`)

```env
WPAS_ACTIVATION_MODE=LOCAL
BLUEZONE_BAT_PATH=C:\ruta\completa\src\wpas\worker\Lanzador_Bluezone.bat
WPAS_API_BASE=http://localhost:3000/api/sync
WPAS_AWS_AUTO_SHUTDOWN=0
```

`WPAS_ACTIVATION_MODE=AWS` solo registra que falta StartInstances; no enciende la VM todavia.

## Prueba local

1. `pnpm run start` (o `start:dev`) en `sync-wand`.
2. Deja `bzw2h.bzlp` junto al BAT o en `D:\Downloads`. El script y `config.env` se pueden bajar solos.
3. `POST /api/sync/wpa/jobs` con 1-2 reservaciones.
4. Esperar `RUNNING` luego `COMPLETED`.
5. `GET /api/sync/wpa/jobs/{id}` debe traer `results` con WPAs (no solo `status`).
6. `GET /api/sync/wpa/worker/logs` para ver BAT/JS.

El loop del BAT: job → abre BlueZone Session 1 → espera COMPLETED/ERROR en Nest → **cierra BlueZone siempre** → siguiente job o idle 30s.
