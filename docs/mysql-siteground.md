# MySQL para sync-wand

## Desarrollo recomendado

Usa Docker con MySQL 8.4, no la base de produccion. Copia `.env.example` a `.env`, conserva tus variables WAND actuales y ejecuta `docker compose up -d`. Con `DB_SYNCHRONIZE=true`, TypeORM crea las tablas `wand_ras`, `wpas`, `wpa_jobs` y `wpa_workers` automaticamente.

No ejecutes `DB_SYNCHRONIZE=true` contra SiteGround ni una base con datos reales. Para produccion se deben crear migraciones SQL revisables antes del primer despliegue.

## SiteGround

1. En Site Tools crea una base y un usuario exclusivos para la API.
2. Importa `docs/sql/siteground-initial-schema.sql` desde phpMyAdmin para crear las tablas requeridas.
3. En **Site > MySQL > Remote** autoriza exclusivamente la IP de salida fija donde se desplegara Nest (por ejemplo, una Elastic IP de AWS). Nunca uses `%`.
4. Copia host, puerto, usuario, contrasena y nombre de base a las variables `DB_*` del entorno de Nest.
5. Usa `DB_SYNCHRONIZE=false`.

La API Nest debe vivir en un servidor que acepte HTTPS publico. La instancia Windows/BlueZone solo necesita salida HTTPS hacia esa API; no necesita recibir conexiones entrantes desde Nest.

## MongoDB legado

La aplicacion ya no carga `MongooseModule` ni los schemas Mongo. Las dependencias y la carpeta local `mongo/` se mantienen temporalmente para consultar o migrar datos anteriores. El bloque Mongo en `docker-compose.yaml` y `app.module.ts` esta comentado.
