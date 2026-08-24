# Proyecto: BlueZone WPA Worker

## Objetivo

Obtener el WPA de cada reservacion desde BlueZone y reportar todos los resultados al servidor Nest.

## Flujo

```text
Main.js
  -> ApiClient.GetConfiguration()
  -> Connection.Login()
  -> Worker.Process()
       -> ReservationProvider.GetReservations()
       -> Host (BlueZone)
  -> ApiClient.SendResults()
  -> Connection.Logout()
```

`Main.js` es el punto de entrada y carga los archivos en el orden necesario. Se ejecuta con:

```text
cscript //nologo Main.js
```

## Responsabilidades

- `config.js`: valores configurables y objetos globales de BlueZone.
- `Logger.js`: salida en consola y archivo de log; un fallo de logging no detiene el worker.
- `Host.js`: único adaptador del objeto COM de BlueZone.
- `Connection.js`: conexión, login, cambio de contraseña y logout.
- `ReservationProvider.js`: lista de reservaciones desde archivo o API.
- `Worker.js`: navegación 502, reintentos, detección de errores/no encontrada y extracción de WPA.
- `ApliClient.js`: cliente HTTP compatible con JScript clásico.
- `Main.js`: orquestador del ciclo completo.

## Contrato HTTP con Nest

Con el prefijo global actual, las rutas son:

- `GET /api/sync/wpas/worker-config`: configuración de sesión y credenciales para el worker.
- `GET /api/sync/wpas/reservas`: cola de reservaciones pendientes cuando `RESERVATIONS.Source = "API"`.
- `POST /api/sync/wpas/resultados`: recibe `{ worker, stats, results }` al terminar el proceso.

Cada resultado contiene `reservation`, `success`, `status`, `wpa`, `message`, `attempts`, `startedAt`, `finishedAt` y `durationMs`. Los estados posibles son `OK`, `NOT_FOUND` y `ERROR`.

## Reglas

- JScript compatible con BlueZone: sin clases, módulos ni librerías externas.
- No acceder a `host` fuera de `Host.js`.
- Las credenciales se obtienen desde el endpoint de configuración, no se guardan en los scripts.
- Los resultados, incluidos errores y reservaciones no encontradas, se envían en un solo POST.
