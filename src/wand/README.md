# Modulo WAND / RAs

Prefijo global: **`/api/sync`**. Base: `http://localhost:3000/api/sync`.

WAND es el sistema web de Avis para **Rental Agreements (RA)**. Este modulo inicia sesion, rota la contraseña cuando toca, consulta un RA remoto y lo cachea en MySQL (`wand_ras`).

No extrae WPAs. Para WPAs usa el modulo [WPAS](../wpas/README.md).

## Que es un RA

Un **RA** (rental agreement) es el contrato de renta. Se consulta por numero de RA (`raNum`). Puede incluir `resNum` (reservacion), cargos, coberturas (LDW, PAI, PEP, ALI) y totales QV.

La entidad `WandRA` (`wand_ras`) guarda una copia local la primera vez que se consulta ese RA. Consultas siguientes al mismo numero no duplican la fila.

## Sesion y contraseña

- `POST /wand/login` fuerza rotacion si ya vencio el plazo y luego hace login WAND.
- `GET /wand/:ra` y el resto de llamadas de negocio llaman `rotateIfDue()` y `ensureLogin()` para no trabajar con sesion caduca.
- La rotacion vive en `auth/wand-password-rotation.service.ts` y las credenciales en `auth/wand-credential-store.service.ts`.
- `POST /wand/password/rotate?force=true` rota ya, sin esperar la fecha.

## Endpoints

| Metodo | Ruta | Uso |
|---|---|---|
| `POST` | `/wand/login` | Login a WAND (y rotacion si aplica). |
| `GET` | `/wand/password/rotation-status` | Ultima rotacion / si ya toca cambiar password. |
| `POST` | `/wand/password/rotate?force=true` | Rotar password. Sin `force=true` solo rota si vencio. |
| `GET` | `/wand/:ra` | Consulta el RA en WAND (`DISPLAY-RENTAL`), mapea a dominio y cachea en `wand_ras`. |
| `DELETE` | `/wand/:ra` | Borra el RA de la cache local (`wand_ras`). No borra en WAND. |

Ejemplos:

```http
POST http://localhost:3000/api/sync/wand/login
GET  http://localhost:3000/api/sync/wand/password/rotation-status
POST http://localhost:3000/api/sync/wand/password/rotate?force=true
GET  http://localhost:3000/api/sync/wand/123456789
DELETE http://localhost:3000/api/sync/wand/123456789
```

`GET /wand/:ra` exige `agentId` de sesion. Si no hay login previo valido, responde 502 (`No hay agentId activo para consultar WAND`).

`DELETE` responde 400 si ese `raNum` no esta en la base local.

## Tablas y archivos

- Tabla **`wand_ras`**: `ra_num` (unico), `res_num`, coberturas, `total_charges_rate_amt`, `out_string`, totales QV, `status`.
- Mapper: `mapper/RentalMapper.ts` convierte la respuesta WAND al objeto de dominio `RA`.
- Cliente HTTP y cookies: `auth/session.service.ts` (`POST /wand/rental` en el host WAND, no en este Nest).

## Relacion con WPAS

| | WAND / RA | WPAS |
|---|---|---|
| Sistema origen | WAND web | BlueZone 3270 |
| Clave | Numero de RA | Numero de reservacion |
| Resultado | Detalle de renta + cache `wand_ras` | Codigo WPA por reservacion |
| Worker Windows | No | BAT + JS BlueZone |
