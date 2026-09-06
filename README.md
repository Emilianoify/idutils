# IDUtils

Sistema de gestión de pacientes para coordinaciones de Internación Domiciliaria (ID).

## Para quién

Para coordinaciones y PyMES que crecen: la persona que subcontrata una o varias
empresas de ID y necesita saber, sin depender de su memoria, un Excel o un WhatsApp:

- qué pacientes tiene activos, de qué empresa y de qué obra social;
- qué prestación recibe cada uno, con qué frecuencia y quién la realiza;
- **qué está por vencer y a quién hay que reclamarlo.**

## Qué NO es

IDUtils no es un ERP de salud ni un reemplazo de los sistemas de las empresas de ID.
No factura, no maneja stock, no arma agendas y no rutea móviles.

> **IDUtils no es un sistema de registro. Es un sistema de vencimientos y reclamos.**

Todo lo que exceda ese núcleo vive en un módulo opcional, no en el core.

## Estado

En construcción. El dominio está definido y el schema del core está escrito.

### Repositorio

| Carpeta | Qué es |
|---|---|
| `idutils-backend/` | Express 5 + Prisma 7 + PostgreSQL. Clean Architecture |
| `idutils-frontend/` | Next 16 + React 19 + Tailwind 4 (pendiente) |

Una sola base de código y la misma versión en todas las instalaciones (D3). Los
módulos —Amanda, Import, Recorridos— son flags de licencia, nunca ramas.

## Instalar con Docker

Es la forma de instalar una coordinación. Lo único que cambia entre dos
instalaciones es el `.env`.

```bash
# Cargar variables desde un archivo protegido FUERA de OneDrive.
docker compose --env-file /ruta/segura/idutils.env up -d
docker compose --env-file /ruta/segura/idutils.env run --rm migrate pnpm db:seed
```

> El compose base es de producción y falla cerrado: la API se publica sólo en
> `127.0.0.1`, exige `COOKIE_SECURE=true` y al menos un salto de proxy confiable.
> No incluye ni inventa certificados o dominios. Antes de exponer el sistema,
> configurá un reverse proxy con TLS válido que reenvíe a
> `http://127.0.0.1:4000`, y hacé coincidir `TRUST_PROXY_HOPS` con la cantidad
> real de proxies. Postgres nunca publica un puerto.

Para desarrollo local HTTP, el camino explícito es:

```bash
docker compose --env-file /ruta/segura/idutils.env \
  -f docker-compose.yml -f docker-compose.local.yml up -d
```

### Secretos fuera de OneDrive

Los secretos reales que hoy estén bajo una carpeta sincronizada necesitan
**reubicación manual**; este repositorio no los mueve ni los lee. Creá un archivo
fuera de OneDrive, copiá los valores manualmente sin imprimirlos, restringí sus
permisos y eliminá la copia sincronizada sólo después de verificar el arranque.

```bash
# Linux: directorio y archivo legibles sólo por el usuario del servicio.
install -d -m 700 ~/.config/idutils
install -m 600 /dev/null ~/.config/idutils/production.env
```

```powershell
# Windows: ejemplo de directorio local no sincronizado; no muestra valores.
New-Item -ItemType Directory -Force C:\ProgramData\IDUtils\Config
icacls C:\ProgramData\IDUtils\Config /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
```

Usá siempre `docker compose --env-file <ruta-protegida> ...`. No agregues el
archivo al repositorio, a imágenes Docker, backups sin cifrar ni tickets.

Tres servicios, y el orden importa:

| Servicio | Qué hace | Cuándo |
|---|---|---|
| `db` | Postgres 18 con su volumen. Lo único con estado | Siempre |
| `migrate` | Aplica las migraciones y termina | Una vez por despliegue |
| `backend` | La API | Cuando `migrate` terminó **bien** |

**Las migraciones no corren adentro del backend, y no es un detalle de
organización.** Si el proceso que atiende pedidos también supiera migrar,
tendría adentro el CLI de Prisma y el schema, y cualquier ejecución remota de
código podría alterar la base. La imagen de producción instala con
`--prod --no-optional`: conserva el cliente generado y su runtime, pero excluye
el peer opcional `prisma`, el CLI y su árbol de configuración. Esto se valida
inspeccionando la imagen y ejecutando su healthcheck; el mismo motivo explica por
qué el seed se corre desde `migrate` y no desde `backend`.

`pnpm audit --prod` todavía puede informar `deepmerge-ts <8` por el camino
opcional `@prisma/client → prisma → @prisma/config`. Prisma 7.10 fija
`deepmerge-ts` 7.x y la primera corrección disponible es 8.x; no se fuerza ese
salto mayor. La imagen runtime excluye y verifica la ausencia de todo ese camino.
La acción pendiente es actualizar Prisma cuando una versión compatible adopte
`deepmerge-ts >=8`, manteniendo mientras tanto la inspección de imagen como gate.

Si las migraciones fallan, el backend **no levanta**. Una API caída se arregla;
una API sirviendo sobre un esquema a medio migrar escribe datos que después hay
que reconstruir a mano.

Tres cosas más que están puestas a propósito:

- **La base no publica puerto.** El backend la alcanza por la red interna.
  Para mirarla: `docker compose exec db psql -U idutils -d idutils`.
- **`PGDATA` apunta a un subdirectorio** del volumen, no a la raíz. Es lo que
  hace que el volumen sobreviva a un cambio de versión mayor de Postgres.
- **Si `POSTGRES_PASSWORD` lleva `@ : / ? # %`**, va percent-encoded: viaja
  adentro de una URL, y sin escapar la parte en el lugar equivocado.

### Backup y restauración

El volumen local **no es un backup**. No hay backup real hasta configurar un
destino externo, cifrado y con retención. El siguiente contrato no embebe
destinos ni credenciales: quien opera debe definir `BACKUP_FILE` en un filesystem
protegido que después se replique fuera del host.

```bash
export IDUTILS_ENV_FILE=/ruta/segura/idutils.env
test -n "$IDUTILS_ENV_FILE"
umask 077
test -n "$BACKUP_FILE"
docker compose --env-file "$IDUTILS_ENV_FILE" exec -T db sh -c \
  'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
```

Verificá cada artefacto con `pg_restore --list` y hacé periódicamente una
restauración completa en una base aislada, nunca sobre producción:

```bash
docker compose --env-file "$IDUTILS_ENV_FILE" exec -T db sh -c \
  'dropdb --if-exists -U "$POSTGRES_USER" idutils_restore_verify && createdb -U "$POSTGRES_USER" idutils_restore_verify'
docker compose --env-file "$IDUTILS_ENV_FILE" exec -T db sh -c \
  'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d idutils_restore_verify' \
  < "$BACKUP_FILE"
docker compose --env-file "$IDUTILS_ENV_FILE" exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d idutils_restore_verify -c "SELECT count(*) >= 1 AS migrations_present FROM \"_prisma_migrations\""'
docker compose --env-file "$IDUTILS_ENV_FILE" exec -T db sh -c \
  'dropdb -U "$POSTGRES_USER" idutils_restore_verify'
```

Una restauración válida exige además arrancar la versión compatible de la API y
pasar su healthcheck. Documentá fecha, versión, checksum, destino cifrado,
retención y resultado del ensayo sin registrar datos de pacientes.

### Puesta en marcha del backend (sin Docker)

Primero, el rol y la base. Se hace una sola vez por instalación, con el
superusuario de PostgreSQL:

```sql
CREATE ROLE idutils LOGIN CREATEDB PASSWORD 'la-de-esta-instalación';
CREATE DATABASE idutils OWNER idutils;
```

`CREATEDB` no es de más: Prisma crea y descarta una *shadow database* temporal
en cada migración, y sin ese permiso `migrate dev` falla con un error que no
menciona la palabra permiso. Si la base ya existía y es de otro dueño, hace
falta además `ALTER DATABASE idutils OWNER TO idutils;` y
`ALTER SCHEMA public OWNER TO idutils;` — desde PostgreSQL 15 el esquema
`public` ya no da permiso de creación a todo el mundo.

En Windows, el instalador de EDB **no pone `psql` en el PATH**: está en
`C:\Program Files\PostgreSQL\<versión>\bin\psql.exe`. Que el comando no exista
no quiere decir que el servidor no esté corriendo.

Después, el backend:

```bash
cd idutils-backend
pnpm install
cp .env.example .env          # apuntar DATABASE_URL a la base de la coordinación

pnpm prisma migrate dev --create-only --name init
cat prisma/sql/core_invariants.sql >> prisma/migrations/*_init/migration.sql
pnpm prisma migrate dev
```

Ese `cat` no es un paso opcional ni un detalle de instalación:
[`core_invariants.sql`](idutils-backend/prisma/sql/core_invariants.sql) lleva las
reglas que Prisma no sabe expresar —el `EXCLUDE` de episodios no solapados, los
índices únicos parciales de afiliación y prestación— y sin él la base acepta
datos que el modelo declara imposibles.

El borde entre core y módulos (D4) está verificado por
[`tests/architecture/coreBoundary.test.ts`](idutils-backend/tests/architecture/coreBoundary.test.ts),
no por acuerdo: `pnpm test` falla si el schema del core nombra a un módulo.

### El seed de instalación

```bash
# En .env: SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 12 caracteres).
# La contraseña NO tiene default y no se genera sola: un default es una
# credencial conocida que sobrevive justamente donde nadie la cambió.
pnpm db:seed
```

Siembra el primer usuario `ADMIN` y el catálogo base: las frecuencias, las
especialidades **con el subconjunto de frecuencias que cada una habilita** (D11)
y las 24 provincias. Con `SEED_DEMO=true` agrega además una obra social, una
empresa con convenio, una localidad y un profesional, para poder probar la API a
mano.

Correrlo dos veces es inofensivo, y eso está probado. Lo importante es lo que
**no** hace:

- **No resucita** una frecuencia o especialidad que la coordinación dio de baja.
  Cada catálogo se saltea entero si ya tiene alguna fila, porque una fila
  ausente no significa "falta": significa que alguien la sacó a propósito.
- **No pisa la contraseña** del administrador si el usuario ya existe. Si la
  pisara, cada `pnpm db:seed` después de una migración sería un reseteo
  silencioso a la credencial del `.env` de instalación.

Las especialidades y sus frecuencias son un **punto de partida**, no doctrina:
están para que el día uno se pueda cargar un paciente, y se ajustan desde la
administración.

### Los dos comandos de test

| Comando | Qué prueba | Necesita |
|---|---|---|
| `pnpm test` | Las reglas del dominio y de la aplicación, contra repositorios en memoria | Nada |
| `pnpm test:integration` | Los adaptadores de Prisma y la API entera contra Postgres: el `EXCLUDE`, los índices únicos parciales, el rollback, la sesión, los roles y el seed | `TEST_DATABASE_URL`, `DATABASE_URL` e historial de migraciones al día |

> **`TEST_DATABASE_URL` es obligatoria y tiene que ser distinta de
> `DATABASE_URL`.** Los tests de integración hacen `TRUNCATE` de todas las
> tablas: apuntados a la base de trabajo borran los datos de la coordinación,
> no fallan, y nadie se entera hasta que alguien abre el dashboard. Sin la
> variable no arrancan — falla cerrado a propósito.
> Antes de cualquier `TRUNCATE`, el preflight identifica ambos destinos mediante
> PostgreSQL y compara el ledger `_prisma_migrations` de TEST con los directorios
> versionados. Una migración pendiente, fallida o desconocida bloquea toda la suite.
>
> ```sql
> CREATE DATABASE idutils_test OWNER idutils;
> ```
> ```bash
> DATABASE_URL="...idutils_test..." pnpm prisma migrate deploy
> ```

Están separados a propósito. `pnpm test` tiene que estar verde en cualquier
máquina sin preparar nada; los de integración prueban justamente lo que ningún
fake puede simular, y ahí sí hace falta la base. Si el `cat` de
`core_invariants.sql` se saltea en una instalación,
`pnpm test:integration` falla de entrada y en bloque — es el único modo de que
ese paso no se olvide en silencio.

#### Recuperación segura ante deriva de migraciones en TEST

No se debe usar `migrate resolve` ni marcar una migración como aplicada sólo para
habilitar los tests. Primero hay que ejecutar `pnpm prisma migrate status` contra
TEST e identificar la migración pendiente o divergente. Después se compara su
`migration.sql` con la estructura real y con el ledger `_prisma_migrations`, sin
copiar URLs ni credenciales a logs o tickets.

Si la migración realmente falta, se aplica con `migrate deploy` únicamente sobre
TEST. Si la estructura ya existe por un cambio manual, se documenta la evidencia
SQL y se reconcilia manualmente sólo después de revisar cada sentencia. La prueba
preferida es crear una base aislada vacía, ejecutar todas las migraciones y correr
la suite completa antes de tocar un entorno con datos.

## La API

Todas las respuestas de error tienen la misma forma:
`{ success: false, message, details? }`.
`details` trae **todas** las violaciones y no la primera, para que un formulario
pueda marcar los tres campos juntos en vez de uno por intento.

| Método y ruta | Qué hace | Rol |
|---|---|---|
| `POST /api/auth/login` | Abre sesión. Los tokens van en cookies `httpOnly`, nunca en el cuerpo | — |
| `POST /api/auth/refresh` | Renueva el par de tokens | — |
| `POST /api/auth/logout` | Cierra **esta** sesión | — |
| `GET /api/auth/me` | Quién soy, según la base y no según el token | sesión |
| `GET /api/dashboard` | Contadores, corte por empresa, reclamos y bandejas. Una sola llamada | lectura |
| `GET /api/affiliations/lookup` | El paso obligatorio de D8, antes de crear un paciente | lectura |
| `GET /api/patients` | El listado con el que se decide vincular o crear | lectura |
| `POST /api/patients` | Alta de paciente **con** su afiliación, en una transacción | escritura |
| `GET /api/patients/:id` | La ficha, con estado y bandeja ya derivados | lectura |
| `PATCH /api/patients/:id` | Corrige datos mal cargados. No toca cobertura ni estado | escritura |
| `POST /api/patients/:id/deactivate` | Baja de un paciente cargado **por error**. Falla si tiene episodios | escritura |
| `GET /api/patients/:id/readmission-draft` | Borrador de reingreso. **No escribe nada** | lectura |
| `POST /api/patients/:id/insurance-provider-change` | Cambio de obra social: cierra afiliación, cierra episodio y abre la nueva | escritura |
| `POST /api/episodes` | Abre el episodio con sus prestaciones | escritura |
| `POST /api/episodes/:id/close` | Cierra y devuelve **en qué bandeja queda** el paciente | escritura |
| `POST /api/care-services` | Agrega una prestación a un episodio abierto | escritura |
| `PATCH /api/care-services/:id/professional` | Asigna o desasigna profesional | escritura |
| `POST /api/care-services/:id/end` | Baja individual, sin cerrar el episodio | escritura |
| `GET /api/care-services/:id/authorizations` | La línea de tiempo para una auditoría | lectura |
| `POST /api/care-services/:id/authorizations` | Renovar es **agregar** una fila, nunca editar | escritura |
| `POST /api/authorizations/:id/claim` | Deja constancia del reclamo. Reclamar **no** es autorizar | escritura |
| `GET /api/catalogs/*` | Los selectores: obras sociales alcanzables, empresas con convenio, especialidades, frecuencias elegibles, profesionales, provincias, localidades | lectura |
| `GET /health` | Para el `HEALTHCHECK` del contenedor. No toca la base | — |

Lectura es cualquiera de los tres roles; escritura es `ADMIN` u `OPERADOR`.
`LECTOR` nunca escribe (D14). Los permisos se leen todos juntos en
[`routes/index.ts`](idutils-backend/src/interfaces/http/routes/index.ts): "quién
puede hacer qué" es una pregunta que alguien va a hacer, y tiene que poder
contestarse leyendo un archivo en vez de quince.

Fijate que **no hay ningún `PUT` de autorización**. La prestación vive y las
autorizaciones se suceden abajo; pisar un `validUntil` borraría la línea de
tiempo con la que se defiende una auditoría.

### Sesión

Access token de 15 minutos y refresh de 7 días, los dos en cookies `httpOnly` +
`SameSite=Strict`, con **dos secretos distintos**. Que sean distintos es lo que
hace imposible —y no sólo improbable— que un access token robado se presente en
`/api/auth/refresh` y se renueve solo.

Cada login crea una familia independiente en `refresh_sessions`. El refresh
**rota**: la base guarda sólo su identificador opaco vigente, una actualización
condicional lo consume y publicar un sucesor invalida al anterior. Reutilizar un
predecesor revoca esa familia, sin afectar otros dispositivos.

La migración que crea `refresh_sessions` debe aplicarse **antes** de desplegar la
nueva imagen del backend. El frontend agrupa los 401 concurrentes en un único
refresh y reintenta cada pedido original una sola vez; disparar refresh paralelos
puede presentar un predecesor rotado y revocar la familia.

`tokenVersion` conserva el corte global: sube al cambiar la contraseña o dar de
baja y mata todas las sesiones anteriores. Cerrar sesión revoca únicamente la
familia de ese navegador y borra sus cookies.

**Cada pedido lee el usuario de la base.** No alcanza con la firma del token: un
token firmado dice quién era el usuario cuando inició sesión, y con eso solo,
dar de baja a alguien le corta el refresh pero su access token sigue sirviendo
hasta quince minutos. En una coordinación de cinco personas, quince minutos es
toda la tarde.

El precio es una lectura por clave primaria en cada pedido, y una coordinación
no tiene un problema de volumen: tiene un problema de memoria (D0). Lo que se
compra es que la baja, el cambio de contraseña y el cambio de rol signifiquen
**ahora**. Está cubierto por
[`tests/integration/revocation.test.ts`](idutils-backend/tests/integration/revocation.test.ts):
ese archivo es el que hay que leer antes de sacar esa consulta "porque pega a la
base en cada request".

### Dar de baja a un paciente no es darle el alta

`POST /api/patients/:id/deactivate` es para un paciente **cargado por error**:
se duplicó, o se equivocaron de persona. Si el paciente tiene episodios, falla
con un 409 que dice qué hacer en su lugar: cerrar el episodio con su motivo.
Esa historia es con la que se defiende una auditoría.

La baja **también da de baja la afiliación**, y no es prolijidad. El índice
único parcial filtra por `"to" IS NULL AND "deletedAt" IS NULL`: si la afiliación
quedara viva, seguiría ocupando el par (obra social, N° de afiliado) para
siempre, y el paciente de verdad no se podría cargar nunca. El síntoma sería
*"ya hay un paciente con ese número"* señalando a alguien que no está en ninguna
lista.
