# CLAUDE.md — Backend

Lee este archivo completo antes de escribir una línea de código.

Este documento cubre **solo el backend**. El frontend (Next.js) tiene su propio
CLAUDE.md independiente y consume este backend exclusivamente vía HTTP — nunca
comparten código ni tipos por import directo.

## Jerarquía de autoridad

```
1. El código real de este repo   ← la convención vigente
2. Este archivo                  ← se actualiza cuando 1 cambia
```

Este archivo describe el código; no lo gobierna. Si contradice lo que hay en
`src/`, **gana el código**: avisá del desajuste y arreglá el documento.

**Única excepción — las secciones marcadas `[OBJETIVO]`.** Ahí el documento
describe adónde va el proyecto, no dónde está: son convenciones heredadas que
todavía no están implementadas. **Nunca importes ni asumas que existe algo de un
bloque `[OBJETIVO]` sin verificarlo primero.** La lista completa está en
"Migraciones pendientes", al final.

---

## Stack

| Capa            | Tecnología                                      | Versión                        |
| --------------- | ----------------------------------------------- | ------------------------------ |
| Runtime         | Node.js                                         | 24+ LTS                        |
| Framework       | Express                                         | 5.2+                           |
| Lenguaje        | TypeScript                                      | 6.0 hoy → **7 [OBJETIVO]**     |
| ORM             | Prisma                                          | 7.9+                           |
| Base de datos   | PostgreSQL                                      | 18 (`postgres:18-alpine`)      |
| Validación      | Zod                                             | 4.4+                           |
| Auth            | argon2 + jsonwebtoken                           | cookies httpOnly               |
| Package manager | pnpm                                            | 11.20, exclusivo               |
| Seguridad       | helmet, cors, express-rate-limit, cookie-parser | —                              |
| Logging         | morgan + winston                                | —                              |
| Testing         | vitest + supertest                              | unit + integration, separados  |
| Deploy          | Docker + Nginx                                  | VPS, `idutils.com.ar`          |

El salto a TypeScript 7 es por tiempo de compilación, no por features.

---

## Reglas absolutas — nunca violar

```
❌ NO comentar todo el código generado — solo lo que tiene lógica compleja o
   una decisión que no se deduce leyendo
❌ NO usar any; ni unknown sin type guard explícito
❌ NO usar 'as' para tipar — si no existe el tipo correcto, se crea
❌ NO usar console.log — solo el logger de winston
❌ NO comparar ni asignar enums contra strings — siempre el miembro del enum
❌ NO schemas Zod inline en un archivo de rutas — viven en http/schemas/
❌ NO lógica de negocio en controllers — solo en use-cases
❌ NO queries Prisma fuera de infrastructure/database/repositories/
❌ NO tocar req ni res fuera de interfaces/http/
❌ NO try/catch en controllers — el errorHandler es el único traductor
❌ NO armar una respuesta HTTP a mano — solo responseHelper
❌ NO hardcodear — ni mensajes, ni listas de negocio, ni configuración
❌ NO hardcodear mensajes — solo ERROR_MESSAGES y SUCCESS_MESSAGES
❌ NO Bearer token — solo cookies httpOnly
❌ NO commits — el desarrollador revisa y commitea
❌ NO instalar dependencias sin consultar
❌ NO archivos kebab-case — solo camelCase
❌ NO usar npm ni yarn — solo pnpm
❌ NO exponer Postgres a internet — solo el backend le habla a la base
❌ NO nombrar un módulo desde el schema del core (D4) — el test lo frena
```

---

## Arquitectura — Clean Architecture

Las dependencias apuntan siempre hacia adentro. Nunca hacia afuera.

```
Infrastructure → Application → Domain
     ↑                ↑
  HTTP layer      Use Cases
```

| Capa               | Responsabilidad                                    | Puede importar de         |
| ------------------ | -------------------------------------------------- | ------------------------- |
| `domain/`          | Entidades, enums, reglas puras e interfaces         | Nadie                     |
| `application/`     | Casos de uso y DTOs — orquesta el dominio           | `domain/`, `shared/`      |
| `infrastructure/`  | Prisma, clock, config, logging, security, mappers   | `domain/`, `shared/`      |
| `interfaces/http/` | Controllers, routes, middlewares, schemas           | `application/`, `shared/` |
| `shared/`          | Helpers, errores, constantes, normalización         | Nadie                     |

### Lo que nunca ocurre

- `domain/` no importa Prisma, Express ni ninguna librería externa
- `application/` no importa Prisma ni Express — nunca toca `req` ni `res`
- `infrastructure/database/repositories/` no contiene lógica de negocio
- `interfaces/http/controllers/` no contiene lógica de negocio

### Estructura de carpetas

```
src/
  domain/
    entities/          patientEntity.ts, careServiceEntity.ts, ...
    enums/             patientStatus.ts, workQueue.ts, authorizationStatus.ts
    repositories/      IPatientRepository.ts, IClock.ts, IUnitOfWork.ts, ...
    services/          authorizationCoverage.ts, episodeTimeline.ts, ...
  application/
    dto/               authDto.ts, patientDto.ts, episodeDto.ts, dashboardDto.ts
    useCases/<dominio>/createPatientUseCase.ts, ...
  infrastructure/
    config/            env.ts
    database/
      prismaClient.ts
      repositories/    [OBJETIVO] hoy están en infrastructure/repositories/
    logging/           logger.ts
    security/
    clock/
    mappers/
  interfaces/http/
    app.ts
    routes/index.ts
    controllers/       patientController.ts, episodeController.ts, ...
    middlewares/       authenticate.ts, errorHandler.ts
                       audit.ts
    schemas/           commonSchemas.ts, patientSchemas.ts, ...
                       [OBJETIVO] paramsSchema.ts
  shared/
    constants/messages.ts
    errors/AppError.ts, assertNoViolations.ts
    helpers/           dateOnly.ts, responseHelper.ts
    normalization/     email.ts, memberNumber.ts
```

Los DTOs viven en **`application/dto/`**, no en `interfaces/http/dtos/`.

---

## Flujo de una request

```
Request HTTP
  → route
  → middleware(s): authenticate → audit → rbac → validate
  → controller: extrae DTO, llama al use-case, responde
  → use-case: lógica de negocio, usa la INTERFAZ del repositorio
  → repository (impl): query Prisma
  → PostgreSQL

Response
  ← controller: send*(res, MESSAGE, data)
  ← use-case: retorna DTO
  ← repository: retorna entity
```

Los controllers **no tienen try/catch**. Express 5 reenvía las promesas
rechazadas, así que un `throw new AppError(404, ...)` desde un use-case llega
solo hasta el `errorHandler`. Un try/catch por controller es donde se pierde un
error de verdad detrás de un 500 genérico.

---

## Naming conventions

```
Archivos:              camelCase          patientRepository.ts
                                          createPatientUseCase.ts

Archivos de interfaz:  IPascalCase.ts     IPatientRepository.ts
                       (única excepción a camelCase)

Clases:                PascalCase         CreatePatientUseCase
Interfaces:            PascalCase + I     IPatientRepository
Variables/funciones:   camelCase          statusAt(), requiresClaim()
Constantes globales:   UPPER_SNAKE_CASE   ERROR_MESSAGES
DTOs:                  PascalCase + Dto   CreatePatientDto, PatientResponseDto
Schemas HTTP:          <dominio>Schemas.ts  patientSchemas.ts (plural)

Tablas DB:             snake_case plural  patients, care_services
Campos DB:             camelCase          firstName, createdAt, deletedAt
```

---

## Idioma — nombres en inglés, valores en español

La regla es **nombre vs valor**, y no admite mezcla:

```
Nombres (tablas, campos, variables, funciones, tipos, miembros de enum) → inglés
Valores (contenido de un enum, mensajes al operador)                    → español
```

```prisma
enum CloseReason {     // nombre en inglés
  ALTA_MEDICA          // valor en español — es vocabulario del negocio
  CAMBIO_OBRA_SOCIAL
}
```

**Excepción crítica — los literales de sistemas externos son valores, no nombres,
y no se traducen nunca.** Renombrarlos rompe el matcheo en silencio y produce
falsos positivos:

```typescript
fields['especialidad']        // clave del form de un sistema de terceros
getCell(rawRow, 'PACIENTE')   // header de una planilla que nos mandan
```

---

## Mensajes centralizados — shared/constants/messages.ts

Todo string que sale a la red vive acá, agrupado por dominio, con `as const`.
Centralizados por una razón concreta: el mismo error escrito de tres formas
distintas en tres casos de uso hace que el operador crea que son tres problemas
distintos. Y están redactados para que se entienda **qué hacer**, no para
describir el estado interno del sistema.

```typescript
export const ERROR_MESSAGES = {
  AUTH: {
    INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos',
    INACTIVE_USER: 'El usuario está dado de baja',
    FORBIDDEN: 'No tenés permisos para hacer esto',
    UNAUTHENTICATED: 'Iniciá sesión para continuar',
    SESSION_EXPIRED: 'Tu sesión venció. Iniciá sesión de nuevo',
  },
  PATIENT: {
    NOT_FOUND: 'El paciente no existe',
    HAS_EPISODES:
      'No se puede dar de baja un paciente que ya tiene episodios cargados. ' +
      'Si terminó la internación domiciliaria, cerrá el episodio: la baja es ' +
      'solo para un paciente cargado por error',
  },
} as const

export const SUCCESS_MESSAGES = { /* mismo criterio */ } as const
```

---

## responseHelper — shared/helpers/responseHelper.ts

**Toda respuesta HTTP sale de acá.** Ningún controller escribe `res.json()` a
mano. El motivo es concreto: si cada endpoint arma su propia forma, el frontend
termina con un `if` por endpoint para saber dónde está el dato.

Una sola forma, en los dos sentidos:

```
éxito    { success: true,  message, data? }
error    { success: false, message, details? }
paginado { success: true,  message, data: T[], meta }
```

**`data` ES el dato, no una caja con el dato adentro**: `data` es el paciente, no
`{ patient }`. Volver a envolverlo sería conservar el problema con un nombre más
prolijo — el frontend seguiría necesitando saber, endpoint por endpoint, bajo qué
clave está lo que pidió.

`details` lleva **todas** las violaciones y no la primera, para que un formulario
pueda marcar los tres campos juntos en vez de uno por intento.

```typescript
sendOk(res, SUCCESS_MESSAGES.PATIENT.DETAIL, patient)
sendCreated(res, SUCCESS_MESSAGES.PATIENT.CREATED, patient)
sendNoContent(res)                                    // 204: sin cuerpo, sin envelope
sendPaginated(res, SUCCESS_MESSAGES.PATIENT.LIST, items, { limit, offset, total })

// Los de error los usa SOLO el errorHandler. Un controller nunca los llama:
// tira AppError y el manejador traduce.
sendBadRequest · sendUnauthorized · sendForbidden · sendNotFound
sendConflict · sendInternalError · sendError
```

La paginación es por **ventana, no por página**: `{ limit, offset, total }`. Es
`offset` porque es lo que los repositorios reciben y lo que la base ejecuta;
traducir a número de página en el borde sería inventar un concepto que ninguna
capa de abajo usa. `total` va en `meta` y no adentro de `data` porque no es un
paciente: es información sobre la ventana, no sobre el contenido.

`sendPaginated` va solo donde el listado puede crecer sin límite —hoy únicamente
`GET /api/patients`—. Los catálogos son selectores, vienen enteros y van con
`sendOk`: un `meta` sobre una lista que nunca se corta no informa nada.

### Las dos excepciones, y por qué son excepciones

```
GET /health        { status: 'ok' }   su consumidor es el HEALTHCHECK de Docker,
                                      que mira el código de estado. No cuelga de
                                      /api ni pide sesión: no es la API
429 del login      envelope a mano    lo contesta express-rate-limit, no el
                                      errorHandler. Sigue la misma forma, porque
                                      para el cliente un 429 no es un caso aparte
```

Las dos están cubiertas por `tests/integration/api.test.ts`, en
`describe('contrato de respuestas')`. Ese bloque es el que hay que mirar antes de
tocar el envelope: si se rompe, se rompe en silencio —el JSON sigue siendo válido
y la pantalla queda vacía sin un error en consola.

---

## AppError — shared/errors/AppError.ts

```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public override readonly message: string,
    public readonly details?: readonly string[],
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

// En el use-case:
if (episodes.length > 0)
  throw new AppError(409, ERROR_MESSAGES.PATIENT.HAS_EPISODES)

// Nunca en el controller ni en el repository
```

## errorHandler — el único lugar donde un error se vuelve respuesta

Va último en la cadena y traduce cada clase de error:

- `AppError` → ya viene decidido: el use-case es el que sabe si "no existe" es
  404 o 409, y trae el mensaje en el idioma del operador
- `ZodError` → 400 con **todos** los campos que fallaron, no el primero
- `InvalidMemberNumberError` → 400. Es error de dato, no de programa
- Cualquier otra cosa → bug nuestro: se loguea entero y se contesta genérico. El
  stack de Node describe la estructura interna del servidor y no tiene por qué
  salir a la red

La ruta inexistente va como **último middleware**, no como `app.all('*')`: en
Express 5 los comodines del router cambiaron y un patrón suelto es una fuente de
sorpresas.

---

## auditMiddleware — quién hizo qué

Toda operación mutante (`POST`, `PUT`, `PATCH`, `DELETE`) queda registrada. No es
prolijidad: en una coordinación con varios operadores, "¿quién cambió esto?" es
una pregunta que se hace, y una auditoría se defiende con registros, no con
memoria. Es el mismo argumento por el que las autorizaciones se **agregan** y
nunca se editan.

```
Registra:  actor (el usuario verificado contra la base), método, ruta,
           recurso afectado, resultado, timestamp
NUNCA registra: cookies, tokens, contraseñas, hashes, ni el body si trae
           credenciales
```

El actor sale del usuario ya autenticado, nunca del token crudo.

`completed` significa que Express finalizó la respuesta HTTP; `aborted`, que la
conexión se cerró antes de hacerlo. El registro no comparte transacción con la
mutación y, por lo tanto, no demuestra atomicidad durable entre ambos hechos.

---

## Schemas Zod — dónde viven

Todo schema vive en `interfaces/http/schemas/`, un archivo por dominio en plural
(`patientSchemas.ts`, `episodeSchemas.ts`). **Ningún archivo de rutas declara un
`z.object()` propio**: importa y compone.

### [OBJETIVO] paramsSchema.ts

> Hoy lo compartido está en `commonSchemas.ts`. Extraer los params a
> `paramsSchema.ts` y unificar el `:id`.

Un `:id` se valida en **todas** las rutas del sistema. Escribir ese mismo
`z.object({ id: z.uuid() })` en cada archivo es el mismo contrato repetido N
veces, y cambiar el mensaje obliga a tocar N archivos.

```typescript
// schemas/paramsSchema.ts
export const idParamsSchema = z.object({
  id: z.uuid({ error: ERROR_MESSAGES.GENERAL.NOT_FOUND }),
})

export const patientParamsSchema = z.object({
  patientId: z.uuid({ error: ERROR_MESSAGES.GENERAL.NOT_FOUND }),
})

// Rutas anidadas: se extiende, nunca se reescribe
export const careServiceAuthParamsSchema = idParamsSchema.extend({
  authorizationId: z.uuid({ error: ERROR_MESSAGES.GENERAL.NOT_FOUND }),
})
```

```typescript
// ❌ MAL — el mismo contrato declarado en el archivo de rutas
const idSchema = z.object({ id: z.uuid({ error: ERROR_MESSAGES.GENERAL.NOT_FOUND }) })
router.get('/:id', validateParams(idSchema), ctrl.getDetail)

// ✅ BIEN — se importa el que ya existe
import { idParamsSchema } from '../schemas/paramsSchema.js'
router.get('/:id', validateParams(idParamsSchema), ctrl.getDetail)
```

Para combinar se usa `.extend()`, nunca `.merge()` — deprecado en Zod 4.

## Schemas Zod — un mensaje por validación real, nunca duplicado

Cada regla lleva su mensaje, sourced desde `ERROR_MESSAGES`, con el parámetro
unificado `error` de Zod v4 — nunca `message`, `invalid_type_error` ni
`errorMap`.

**Regla clave**: un mensaje por cada validación _distinta_, no uno por campo.

```typescript
// ❌ MAL — dos mensajes para lo que en la práctica es un solo problema
password: z.string({ error: ERROR_MESSAGES.AUTH.PASSWORD_REQUIRED })
           .min(1, { error: ERROR_MESSAGES.AUTH.PASSWORD_REQUIRED })

// ✅ BIEN — una validación real, un mensaje
export const loginSchema = z.object({
  email: z.email({ error: ERROR_MESSAGES.AUTH.EMAIL_INVALID }),
  password: z.string().min(1, { error: ERROR_MESSAGES.AUTH.PASSWORD_REQUIRED }),
})

export type LoginDto = z.infer<typeof loginSchema>

// ✅ BIEN — dos reglas genuinamente distintas, dos mensajes
warningDays: z.number()
  .min(1,   { error: ERROR_MESSAGES.AUTHORIZATION.WARNING_DAYS_TOO_LOW })
  .max(180, { error: ERROR_MESSAGES.AUTHORIZATION.WARNING_DAYS_TOO_HIGH })
```

---

## Zod v4 — sintaxis correcta

```typescript
z.email()            // antes: z.string().email()
z.url()              // antes: z.string().url()
z.uuid()             // antes: z.string().uuid()
z.iso.date()         // antes: z.string().date()
z.iso.datetime()     // antes: z.string().datetime()
z.enum(MiEnum)       // antes: z.nativeEnum(MiEnum) — DEPRECADO
result.error.issues  // antes: result.error.errors
```

- `error` reemplaza a `message`, `invalid_type_error` y `errorMap`
- `.merge()` deprecado → `.extend()` o destructuring de `.shape`
- `z.record()` exige dos argumentos: `z.record(z.string(), z.number())`

---

## Enums — dos familias, y ninguna se reescribe a mano

### Persistidos: `schema.prisma` es la única fuente

```
CloseReason    INTERNACION · ALTA_MEDICA · CAMBIO_OBRA_SOCIAL · FIN_COBERTURA
               SUSPENSION_EMPRESA · BAJA_VOLUNTARIA · MUDANZA_FUERA_DE_ZONA
               FALLECIMIENTO
ServiceUnit    VISITA · SESION · HORA
FrequencyUnit  SEMANAL · MENSUAL
Role           ADMIN · OPERADOR · LECTOR
```

Ninguna otra capa los redefine como union type a mano.

```typescript
// ❌ MAL — redefiniendo el enum en el dominio
export type Role = 'ADMIN' | 'OPERADOR' | 'LECTOR'

// ✅ BIEN — importa el tipo generado
import type { Role } from '../../generated/prisma/client.js'
```

**Excepción explícita a "domain no importa nada externo"**: los enums generados
son import de **solo tipo** (`import type`), sin footprint en runtime. Se tratan
como primitivas del dominio. Lo que `domain/` sigue sin poder importar nunca es
`PrismaClient`, `@prisma/adapter-pg`, o cualquier función que ejecute una query.

**Comparar y asignar: el miembro del enum, nunca el string.** Prisma genera cada
enum como **objeto en runtime** además del tipo.

```typescript
// ❌ MAL — compila, pero es un enum reescrito a mano repartido por el código
if (episode.closeReason === 'ALTA_MEDICA') return
rbacMiddleware('ADMIN')

// ✅ BIEN
import { CloseReason, Role } from '../../generated/prisma/enums.js'

if (episode.closeReason === CloseReason.ALTA_MEDICA) return
rbacMiddleware(Role.ADMIN)
```

`import type` **no alcanza** cuando se necesita el valor: TypeScript falla con
`TS1361`. Ahí el import pasa a ser de valor. Si el archivo necesita las dos
formas: `import { CloseReason, type Role } from '...'`.

La regla de "solo tipo" es de `domain/`, no de `application/` ni
`infrastructure/`. Mismo criterio en los `z.enum()` de los schemas.

### Derivados: `src/domain/enums/`, y NO están en la base a propósito

Estos tres **no existen como columna en Postgres**, y eso es una decisión (D9):
si existieran, alguien los escribiría, y un flag es un valor barato que alguien
se olvida de actualizar. La estructura no se olvida.

```
PatientStatus        ACTIVO · REINGRESA · INTERNADO · PENDIENTE_REAUTORIZACION
                     EGRESADO · FALLECIDO · SIN_INICIAR
                     → derivado de los episodios, con statusAt()
WorkQueue            ESPERANDO_ALTA · REAUTORIZAR · CERRADO · ARCHIVO
                     → el motivo de cierre decide qué aparece como pendiente
AuthorizationStatus  VIGENTE · POR_VENCER · VENCIDA · SIN_AUTORIZACION
                     → derivado de las autorizaciones a una fecha. Es el
                       corazón del sistema
```

Se escriben como **objeto `as const` + tipo del mismo nombre**, no con la
palabra `enum`:

```typescript
export const WorkQueue = {
  ESPERANDO_ALTA: 'ESPERANDO_ALTA',
  REAUTORIZAR: 'REAUTORIZAR',
  CERRADO: 'CERRADO',
  ARCHIVO: 'ARCHIVO',
} as const

export type WorkQueue = (typeof WorkQueue)[keyof typeof WorkQueue]
```

`domain/enums/` no importa de nadie, así que `application/` e `interfaces/`
pueden usarla sin romper la regla de dependencias. Zod 4 acepta ese objeto
directo en `z.enum()`.

**Nunca como array de strings dentro de `z.enum([...])`** — el tipo infiere
bien, y ese es justamente el problema: los valores quedan escritos en dos
lugares y nada falla el día que se desincronizan. Si el enum agrega un
miembro, el schema deja de aceptarlo en silencio.

```typescript
// ❌ MAL — el enum ya está declarado arriba; esto lo repite y se desincroniza
queue: z.enum(['ESPERANDO_ALTA', 'REAUTORIZAR'])

// ✅ BIEN
import { WorkQueue } from '../../../domain/enums/workQueue.js'
queue: z.enum(WorkQueue, { error: ERROR_MESSAGES.GENERAL.VALIDATION_ERROR })
```

**Cómo se verifica que quedó bien**: el tipo inferido no alcanza como prueba —
un array literal inline infiere el union correcto y compila igual que el
objeto. Lo que el compilador sí frena es el cast
`Object.values(x) as [string, ...string[]]`, y para eso sirve la prueba
negativa:

```typescript
type Inferido = ListPatientsDto['queue']
const _control: Inferido = 'CUALQUIER_COSA'
// tiene que dar: Type '"CUALQUIER_COSA"' is not assignable to type 'WorkQueue'
```

La duplicación el compilador no la ve. Esa se busca leyendo, o con
`rg "\.enum\(\[" src prisma tests`, que tiene que dar cero.

El patrón no lleva `z\.` adelante **a propósito, y no hay que "simplificarlo"**:
los schemas de este repo se escriben multilínea, así que `z` queda en un
renglón y `.enum([` en el siguiente (mirá `src/infrastructure/config/env.ts` y
`prisma/seed/seedEnv.ts`). Un `rg "z\.enum\(\["` da cero acá aunque el problema
exista, y esa es la peor respuesta posible: parece limpio. La búsqueda se
acota a `src prisma tests` porque el bloque `❌ MAL` de más arriba vive en este
mismo archivo y contaría como falso positivo.

Si el enum viaja al frontend, los valores tienen que ser **idénticos** a los de
su espejo. Cambiar uno acá rompe el frontend en silencio: el JSON sigue siendo
válido, solo deja de matchear.

### El vocabulario del runtime va junto a su config

`NodeEnv`, `CookieSecure` y compañía no son del negocio: viven en
`infrastructure/config/env.ts`, no en `domain/enums/`.

Cada variable de entorno declara su enum en el módulo que la valida: `NodeEnv`
y `CookieSecure` en `infrastructure/config/env.ts`, `SeedDemo` en
`prisma/seed/seedEnv.ts`. `SEED_DEMO` y `COOKIE_SECURE` aceptan los mismos dos
strings y aun así no comparten declaración: coinciden en la forma, no en el
concepto, y unificarlos ataría los datos de demo a la seguridad de las
cookies.

---

## Tipos — nunca afirmar lo que no se verificó

`tsconfig.json` tiene, además de `strict`:

```
noUncheckedIndexedAccess   → parts[0] es string | undefined, siempre
exactOptionalPropertyTypes → { a?: string } NO acepta { a: undefined }
```

Los dos molestan, y la salida fácil es callarlos con un cast. **Un cast no valida
nada: apaga al compilador y deja pasar el problema hasta que revienta lejos del
origen.**

### `as any` — nunca

```typescript
// ❌ MAL — el tipo casi siempre ya existe
const filters = { page: query.page, limit: query.limit } as any
```

Antes de escribir `as any`, buscar el tipo. Si no está, se crea. `pnpm lint` lo
frena (`no-explicit-any`).

### `exactOptionalPropertyTypes` — spread condicional

Un campo `queue?: WorkQueue` no acepta `{ queue: undefined }`. La propiedad se
**omite**, no se setea en undefined:

```typescript
const filters: ListPatientsFilters = {
  page: query.page,
  limit: query.limit,
  ...(query.queue !== undefined ? { queue: query.queue } : {}),
  ...(query.companyId !== undefined ? { companyId: query.companyId } : {}),
}
```

### Datos externos — `unknown` + type guard real

Todo lo que entra de afuera sin validar llega como `unknown` y **se verifica, no
se afirma**. `as` no es un type guard.

```typescript
// ❌ MAL — si faltan los dos campos, esto es undefined tipado string,
//          y explota lejos de acá
const patientId = (p.patientId ?? p.id) as string

// ✅ BIEN — se verifica y lo que no sirve se descarta
const patientId = readString(entry['patientId']) ?? readString(entry['id'])
if (patientId === undefined) continue
```

Un use-case tampoco devuelve `Promise<unknown>`: si no hay tipo de retorno, se
declara el DTO que corresponde.

### `noUncheckedIndexedAccess` — chequear, no castear

```typescript
// ❌ MAL — el cast afirma que existe
const first = parts[0] as string

// ✅ BIEN
const first = parts[0]
if (first === undefined) return null
```

### Una forma que cruza capas se nombra una sola vez

Si el mismo objeto anónimo aparece en la interfaz del repositorio, en la
implementación y en el use-case, es **un** contrato escrito tres veces.

```typescript
// ❌ MAL — la misma forma repetida en la interfaz, la impl y el use-case
lookup(memberNumber: string): Promise<Array<{ id: string; fullName: string }>>

// ✅ BIEN — nombrada una vez, en el archivo del contrato
export interface AffiliationMatch { id: string; fullName: string }
lookup(memberNumber: string): Promise<AffiliationMatch[]>
```

TypeScript es estructural, así que las copias compilan hasta el día que una se
desincroniza — y ahí el error sale en el lugar equivocado.

**Dónde**: en el archivo del contrato que describe. Los filtros de un repositorio
van en su `I<X>Repository.ts` de `domain/` — nunca en `application/`, o `domain/`
no puede importarlos sin romper la regla de dependencias.

**El límite — no unificar formas que coinciden por casualidad.** La pregunta que
decide es: _si esta forma cambia, ¿tienen que cambiar todas las copias?_ Si la
respuesta es no, son duplicados aparentes y se dejan separados. Un `{id, name}`
genérico compartido por `insuranceProvider`, `specialty` y `locality` significa
que el día que `locality` necesite la provincia, se la arrastra a `specialty`,
que no tiene nada que ver.

Pero cuando la **misma** referencia aparece textual en 3+ DTOs, es el mismo
concepto repetido: se nombra una vez y se reusa, con `Pick<>` desde el DTO de la
entidad cuando los campos coinciden de verdad, o con una interfaz chica propia
cuando no coinciden — por ejemplo cuando la referencia usa un `name` sintetizado
que el DTO de respuesta no tiene (`Professional` tiene `firstName`/`lastName`,
no un `name` plano).

---

## Repositorios Prisma — sin cast, sin reinicialización

`prismaClient.ts` exporta `createPrismaClient`, una función que arma el cliente
una sola vez en el arranque del proceso (`main.ts`) — nunca un singleton
importable, porque el proceso HTTP, el seed y los tests de integración
necesitan cada uno el suyo. Los repositorios reciben el `PrismaContext` ya
armado por parámetro; ninguno instancia su propio `PrismaClient` ni castea el
contexto para esquivar el tipo.

```typescript
// ❌ MAL — castea en vez de recibir el tipo correcto
export function createPrismaPatientRepository(context: unknown): IPatientRepository {
  const { executor } = context as PrismaContext
  return {
    async findById(id) {
      const row = await executor.patient.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toPatient(row)
    },
  }
}

// ✅ BIEN — el contexto llega ya tipado, armado una sola vez en el arranque
import type { PrismaContext } from '../database/prismaContext.js'

export function createPrismaPatientRepository(context: PrismaContext): IPatientRepository {
  const { executor } = context

  return {
    async findById(id) {
      const row = await executor.patient.findFirst({ where: { id, deletedAt: null } })
      return row === null ? null : toPatient(row)
    },
  }
}
```

### Lo que garantiza la base, el código no lo re-chequea

`prisma/sql/core_invariants.sql` lleva las reglas que Prisma no sabe expresar: el
`EXCLUDE` de episodios no solapados y los índices únicos parciales de afiliación
y prestación. Sin ese archivo aplicado, la base acepta datos que el modelo
declara imposibles — y `pnpm test:integration` falla de entrada y en bloque, que
es el único modo de que ese paso no se olvide en silencio.

Ojo con el índice único parcial de afiliación: filtra por
`"to" IS NULL AND "deletedAt" IS NULL`. Por eso dar de baja un paciente **también
da de baja su afiliación**: si quedara viva, ocuparía el par (obra social, N° de
afiliado) para siempre, y el síntoma sería *"ya hay un paciente con ese número"*
señalando a alguien que no está en ninguna lista.

---

## Seguridad

### Flag `secure` de las cookies — nunca derivar de NODE_ENV

Se controla con la env var `COOKIE_SECURE`, **nunca** con
`NODE_ENV === 'production'`. El motivo es concreto: `secure` depende de si hay
TLS real adelante, no del entorno. Un browser descarta en silencio una cookie
`Secure` servida por HTTP en cualquier host que no sea `localhost` — el login
devuelve 200, la cookie se pierde, y la siguiente request cae a `/login`.

```typescript
// main.ts — el único lugar que lee el entorno
const env = loadEnv()
const app = createApp({ /* ...otras dependencias... */, cookieSecure: env.COOKIE_SECURE })

// interfaces/http/controllers/authController.ts — lo recibe por parámetro
const { cookieSecure } = dependencies  // nunca `import { env }` acá

res.cookie('access_token', token, {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000,
})

res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth/refresh',
})
```

`clearCookie` en el logout repite **exactamente** los mismos atributos
(`secure`, `sameSite`, y el `path` del refresh) o el browser no matchea la cookie
y no la borra.

`COOKIE_SECURE` se parsea con `z.enum(CookieSecure)`, **nunca**
`z.coerce.boolean()`: es truthy-based y convierte el string `"false"` en `true`.
`sameSite: 'strict'` es correcto porque front y back comparten host y dominio
registrable (`idutils.com.ar`).

**Invariante de arranque:** `NODE_ENV=production` exige `COOKIE_SECURE=true` y
`TRUST_PROXY_HOPS >= 1`. La API sirve HTTP interno detrás del terminador TLS y
el puerto del compose se liga sólo a `127.0.0.1`. `TRUST_PROXY_HOPS` debe ser la
cantidad real de proxies confiables: un valor mayor permite falsificar la IP y
esquivar el rate limit; uno menor agrupa usuarios bajo la IP del proxy.

### Dos secretos distintos y refresh rotativo por dispositivo

Access token de 15 minutos y refresh de 7 días, los dos en cookies `httpOnly`,
con **secretos distintos**. Que sean distintos es lo que hace imposible —y no
solo improbable— que un access token robado se presente en `/api/auth/refresh` y
se renueve solo.

Cada login crea una fila en `refresh_sessions`. La base guarda únicamente el
identificador opaco del refresh vigente, nunca el JWT bearer. Cada renovación
consume ese identificador con una actualización condicional y publica uno nuevo;
reutilizar un predecesor revoca solo esa familia. Dos renovaciones concurrentes
del mismo token tienen como máximo un ganador.

Los tokens se firman y verifican con `algorithm` pinneado a `HS256`. Sin ese pin,
`jsonwebtoken` acepta el algoritmo que declare el token — incluido `none`.

### `tokenVersion` global; familias para logout y rotación

`tokenVersion` viaja en el payload y `refreshSessionUseCase` lo compara contra el
de la base; distinto = 401.

```
Suben el contador (matan TODAS las sesiones del usuario):
  cambio de contraseña   → en la misma transacción que el hash nuevo
  baja del usuario       → en la misma operación

NO lo suben:
  logout                 → revoca la familia de ESE navegador y borra sus cookies
  refresh                → rota el token opaco dentro de esa misma familia
```

`tokenVersion` no rota por refresh: sigue siendo el corte global para contraseña
y baja. La detección de reuso vive en `refresh_sessions`, de modo que una sesión
comprometida no expulsa a los demás dispositivos. Para cerrar todas las sesiones
a la vez, el camino sigue siendo cambiar la contraseña.

### Cada pedido lee el usuario de la base

No alcanza con la firma del token: un token firmado dice quién era el usuario
cuando inició sesión. Dar de baja a alguien le corta el refresh, pero su access
token seguiría sirviendo quince minutos — y en una coordinación de cinco
personas, quince minutos es toda la tarde.

El precio es una lectura por clave primaria por pedido. Lo que se compra es que
la baja, el cambio de contraseña y el cambio de rol signifiquen **ahora**. Está
cubierto por `tests/integration/revocation.test.ts`: ese archivo es el que hay
que leer antes de sacar esa consulta "porque pega a la base en cada request".

### El resto

- argon2id: `memoryCost: 65536, timeCost: 3, parallelism: 4`
- Rate limit en `/auth/login`: 5 intentos / 15 min por IP
- RBAC verificado en **middleware**, nunca dentro del use-case
- Los permisos se declaran todos juntos en `interfaces/http/routes/index.ts`:
  "quién puede hacer qué" es una pregunta que alguien va a hacer, y tiene que
  poder contestarse leyendo un archivo en vez de quince
- Postgres no publica puerto: el backend la alcanza por la red interna de Docker
- Las migraciones **no corren adentro del backend**. La imagen de producción se
  construye con `--prod --no-optional`: conserva el runtime generado de Prisma,
  pero no su peer opcional `prisma`, el CLI ni su árbol de configuración. Esta
  separación se verifica inspeccionando la imagen, no por el comentario

---

## Este proyecto

**Dominio.** IDUtils no es un sistema de registro: es un sistema de
**vencimientos y reclamos** para coordinaciones de Internación Domiciliaria. No
factura, no maneja stock, no arma agendas, no rutea móviles. Todo lo que exceda
ese núcleo vive en un módulo opcional, nunca en el core.

**Entidades del core.** `Patient` → `Affiliation` → `HomeCareEpisode` →
`CareService` → `Authorization`. La prestación (`CareService`) es la entidad
central (D6); las autorizaciones se suceden abajo y **se agregan, nunca se
editan**: pisar un `validUntil` borraría la línea de tiempo con la que se
defiende una auditoría. Por eso no hay ningún `PUT` de autorización.

**Roles (D14).**

```
ADMIN     todo
OPERADOR  lectura + escritura
LECTOR    solo lectura — nunca escribe
```

Lectura es cualquiera de los tres; escritura es `ADMIN` u `OPERADOR`.

**Módulos (D3/D4).** Una sola base de código y la misma versión en todas las
instalaciones. Los módulos son **flags de licencia, nunca ramas**. El borde entre
core y módulos está verificado por `tests/architecture/coreBoundary.test.ts`:
`pnpm test` falla si el schema del core nombra a un módulo.

**Los dos comandos de test.**

```
pnpm test              dominio y aplicación, con repositorios en memoria. Sin
                       preparar nada, verde en cualquier máquina
pnpm test:integration  adaptadores Prisma y la API entera contra Postgres.
                       Necesita TEST_DATABASE_URL, obligatoriamente distinta de
                       DATABASE_URL: los tests hacen TRUNCATE de todas las tablas
```

**El seed.** Corre desde el servicio `migrate`, nunca desde `backend`. Es
idempotente y no resucita catálogos dados de baja: una fila ausente no significa
"falta", significa que alguien la sacó a propósito. Tampoco pisa la contraseña
del admin si el usuario ya existe.

**Integraciones externas.** Ninguna, hoy. Si aparece una, vive en
`infrastructure/<sistema>/` y sus credenciales son env vars del backend.

---

## Migraciones pendientes — lo marcado `[OBJETIVO]`

Convenciones ya decididas que el código todavía no cumple. **Verificá antes de
importar cualquiera de estas.**

| Pendiente | Hoy | Por qué se migra |
| --- | --- | --- |
| TypeScript 7 | `^6.0.3` | Tiempo de compilación |
| `interfaces/http/schemas/paramsSchema.ts` con `idParamsSchema` | `commonSchemas.ts` — el schema ya existe y ya se reusa; falta mover el archivo | El `:id` se comprueba siempre: mejor un solo schema que N copias |
| `infrastructure/database/repositories/` | `infrastructure/repositories/` | Si el repositorio es de la base, va bajo `database/` |

**Hecho** — `shared/helpers/responseHelper.ts` y el envelope
`{ success, message, data }`. El frontend todavía no existe, así que el cambio no
rompió a nadie; cuando se escriba, `types/api.ts` se tipa contra esta forma.
