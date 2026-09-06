# CLAUDE.md — Frontend

Lee este archivo completo antes de escribir una línea de código.

Este documento cubre **solo el frontend**. El backend (Express + Prisma) tiene su
propio CLAUDE.md. Ambos son independientes — nunca comparten código ni tipos por
import directo, solo HTTP.

> El frontend actual vive en `app/`, `components/`, `config/` y `lib/` en la
> raíz. Las secciones `[OBJETIVO]` describen una posible estructura futura y no
> se importan sin verificar el código real.

---

## Jerarquía de autoridad

```
1. El código real de este repo            ← la convención vigente
2. El backend (schema.prisma, DTOs, rutas) ← la fuente de verdad de los datos
3. Este archivo                            ← se actualiza cuando 1 o 2 cambian
```

Este archivo describe el código; no lo gobierna. Si un prompt de módulo o este
CLAUDE.md contradicen lo que hay en `src/`, **gana el código**: avisá del
desajuste y arreglá el documento, no fuerces el código al molde viejo.

**Única excepción — las secciones marcadas `[OBJETIVO]`.** Ahí el documento
describe adónde va el proyecto, no dónde está. Nunca asumas que existe.

---

## Stack

| Capa            | Tecnología                            | Versión                    |
| --------------- | ------------------------------------- | -------------------------- |
| Framework       | Next.js (App Router)                  | 16+                        |
| Lenguaje        | TypeScript                            | 7+ strict                  |
| UI              | React                                 | 19+                        |
| Estilos         | Tailwind CSS                          | v4                         |
| Componentes     | shadcn/ui                             | latest                     |
| HTTP client     | Fetch centralizado                    | nativo                     |
| Estado global   | Zustand                               | v5                         |
| Formularios     | react-hook-form + @hookform/resolvers | latest                     |
| Validación      | Zod                                   | v4                         |
| Animación       | framer-motion                         | latest                     |
| Toasts          | sonner                                | latest                     |
| Package manager | pnpm                                  | exclusivo                  |
| Deploy          | Docker + Nginx                        | mismo host y dominio registrable que el backend (`idutils.com.ar`) |

---

## Reglas absolutas — nunca violar

```
❌ NO comentar todo el código generado — solo lo que tiene lógica compleja
❌ NO usar any; ni unknown sin type guard explícito
❌ NO usar 'as' para tipar — si no se tiene el tipo correcto, se crea
❌ NO usar console.log — solo en desarrollo, con comentario // dev
❌ NO llamadas de red fuera de lib/api/client.ts
❌ NO lógica de negocio en componentes — solo en stores o lib/
❌ NO hardcodear — todo tiene su lugar
❌ NO hardcodear la URL del backend — solo desde config/env.ts
❌ NO hardcodear mensajes de UI — solo desde lib/messages.ts
❌ NO hardcodear listas de datos de negocio — si existe en el backend, se fetchea
❌ NO inventar valores de enum — los define el backend
❌ NO comparar enums contra strings — siempre el miembro del enum
❌ NO tipar contra la entidad de dominio del backend — solo contra el DTO real
❌ NO usar npm ni yarn — solo pnpm
❌ NO imports relativos entre carpetas de src/ — solo el alias @/
❌ NO extensión .js en los imports — este repo es bundler, no ESM de Node
❌ NO archivos kebab-case — camelCase/PascalCase (excepción: page.tsx, layout.tsx)
❌ NO commits — el desarrollador revisa y commitea
❌ NO instalar dependencias sin consultar
❌ NO fetch directo fuera del cliente centralizado
❌ NO acceder a cookies desde JavaScript — son httpOnly, las maneja el browser
❌ NO schemas Zod inline — cada schema vive en src/schemas/<dominio>Schema.ts
❌ NO z.nativeEnum() — deprecado en Zod 4, se usa z.enum() con el enum directo
❌ NO derivar en el cliente lo que el backend ya deriva (estado, bandeja,
   cobertura) — llega calculado en el DTO
```

---

## Estructura de carpetas

```
proxy.ts               (raíz, NO src/) protección de rutas en Edge Runtime
src/
  app/
    (public)/login/
    (protected)/dashboard/ patients/ ...
  components/
    <dominio>/         PatientsTable.tsx, <Dominio>Hydrator.tsx
    ui/                shadcn/ui
  store/               use<Dominio>Store.ts
  schemas/             <dominio>Schema.ts
  types/
    api.ts             SOLO los envoltorios: ApiResponse<T>, PaginatedResponse<T>
    <dominio>.ts       el enum Y la interface de ese dominio, juntos
  lib/
    apiClient.ts       instancia única de Axios
    serverFetch.ts     fetch tipado para Server Components
    messages.ts        UI_MESSAGES
  config/
    env.ts             validación Zod de las env vars
```

---

## Imports — alias `@/`, sin extensión

`tsconfig.json` mapea `@/*` → `./src/*`. Es la única forma de importar entre
carpetas de `src/`. El `moduleResolution` es `bundler`: **no lleva `.js`** (a
diferencia del backend, que es ESM de Node y sí lo lleva).

```typescript
// ✅ BIEN
import { apiClient } from '@/lib/apiClient'
import { UI_MESSAGES } from '@/lib/messages'
import type { PatientListItem } from '@/types/patient'
import { PatientStatus } from '@/types/patient'

// ❌ MAL — relativo, y con extensión de Node
import { apiClient } from '../lib/apiClient.js'
```

---

## TypeScript — flags estrictos activos

`tsconfig.json` tiene, además de `strict`:

```
noUncheckedIndexedAccess   → rows[0] es PatientListItem | undefined, siempre
exactOptionalPropertyTypes → { a?: string } NO acepta { a: undefined }
```

`exactOptionalPropertyTypes` es la causa de que los filtros se declaren
`queue?: WorkQueue | undefined` y no `queue?: WorkQueue`. Cuando un tipo tenga
que aceptar un `undefined` explícito (típico al inferir de Zod con
`.optional()`), hay que escribirlo:

```typescript
export interface PatientFilters {
  queue?: WorkQueue | undefined
  companyId?: string | undefined
}
```

---

## La forma de la respuesta del backend

El backend ya migró: hay **un solo envelope**, lo arma
`shared/helpers/responseHelper.ts` y sale de ahí tanto el éxito como el error.

```
éxito    { success: true,  message, data? }
error    { success: false, message, details? }
paginado { success: true,  message, data: T[], meta }
```

**`data` ES el dato, no una caja con el dato adentro.** `GET /api/patients/:id`
devuelve `data: <la ficha>`, no `data: { patient: ... }`. Un listado paginado
devuelve `data: <array>` y el total en `meta`, porque el total no es un paciente:
es información sobre la ventana.

Los dos envoltorios se declaran **una sola vez**, en `src/types/api.ts`, y ningún
componente destructura una respuesta a mano — eso vive en `apiClient`.

```typescript
// src/types/api.ts
export interface ApiResponse<T> {
  success: boolean
  message: string
  data?: T
  details?: readonly string[]
}

export interface PaginatedResponse<T> {
  success: boolean
  message: string
  data: T[]
  meta: { limit: number; offset: number; total: number }
}
```

La paginación es por **ventana** (`limit`/`offset`), no por página: es lo que la
base ejecuta. Si la UI necesita número de página, lo calcula la UI.

`details` trae **todas** las violaciones y no la primera, para que un formulario
pueda marcar los tres campos juntos en vez de uno por intento.

Una sola respuesta del backend **no** usa el envelope: `GET /health`, cuyo
consumidor es el HEALTHCHECK de Docker y no la API. Todo lo demás lo respeta,
incluido el 429 del limitador de login.

---

## Tipos — reflejan el DTO real, nunca la entidad de dominio

Regla crítica, y la más fácil de violar sin que TypeScript se dé cuenta.

El backend tiene, para cada modelo, **dos formas distintas**:

```
src/domain/entities/<x>Entity.ts   la entidad completa — vive solo en el backend
src/application/dto/<x>Dto.ts      lo que el mapper realmente manda por HTTP
```

Los DTOs de IDUtils están en **`application/dto/`**, no en `interfaces/http/`.

El frontend tipa contra **el DTO**, que casi siempre tiene menos campos. Tipar
contra la entidad produce un tipo que miente: los campos de más llegan siempre
`undefined` en runtime y TypeScript no lo detecta, porque el JSON entra sin
validar. `authDto.ts` lo dice explícito: `tokenVersion` y `passwordHash` no
salen nunca.

```typescript
// ❌ MAL — copiado de patientEntity.ts. El tipo miente.
export interface Patient {
  id: string
  tokenVersion: number
  deletedAt: string | null
}

// ✅ BIEN — copiado del DTO: es lo que devuelve GET /api/patients
export interface PatientListItem {
  id: string
  fullName: string
  insuranceProvider: { id: string; name: string } | null
  company: { id: string; name: string } | null
  status: PatientStatus     // derivado, viene calculado
  queue: WorkQueue          // derivado, viene calculado
}
```

**Antes de escribir un tipo nuevo**: abrir el DTO y el mapper del backend y
confirmar el endpoint que lo devuelve. Si el endpoint no existe, el tipo no se
escribe todavía. Un tipo sin endpoint es deuda, no adelanto de trabajo.

---

## Enums — el backend es la fuente de verdad

Son un **espejo manual**. Si el backend cambia un valor, se actualiza acá.
**Nunca se inventan valores nuevos en el frontend.** Cambiar uno de un lado rompe
el otro en silencio: el JSON sigue siendo válido, solo deja de matchear.

### Los que hay que espejar

```
De schema.prisma (persistidos)
  CloseReason    INTERNACION · ALTA_MEDICA · CAMBIO_OBRA_SOCIAL · FIN_COBERTURA
                 SUSPENSION_EMPRESA · BAJA_VOLUNTARIA · MUDANZA_FUERA_DE_ZONA
                 FALLECIMIENTO
  ServiceUnit    VISITA · SESION · HORA
  FrequencyUnit  SEMANAL · MENSUAL
  Role           ADMIN · OPERADOR · LECTOR

De src/domain/enums/ (derivados, NO son columnas)
  PatientStatus        ACTIVO · REINGRESA · INTERNADO
                       PENDIENTE_REAUTORIZACION · BAJA · FALLECIDO · SIN_INICIAR
  WorkQueue            ESPERANDO_ALTA · REAUTORIZAR · CERRADO · ARCHIVO
  AuthorizationStatus  VIGENTE · POR_VENCER · VENCIDA · SIN_AUTORIZACION
```

Los tres derivados **llegan ya calculados en el DTO**. El frontend no los
recalcula: los muestra. Volver a derivarlos acá es tener dos implementaciones de
la misma regla, y la del cliente es la que se desactualiza.

### Cómo se escriben

Conjunto fijo y conocido → `enum` de TypeScript, nunca union de string literals.
Eso permite usarlos con `z.enum()` sin duplicar los valores entre el tipo y el
schema.

```typescript
// ❌ MAL — union type: falla con z.enum() y duplica los valores
status: 'ACTIVO' | 'INTERNADO' | 'BAJA'

// ✅ BIEN — src/types/patient.ts
export enum PatientStatus {
  ACTIVO = 'ACTIVO',
  REINGRESA = 'REINGRESA',
  INTERNADO = 'INTERNADO',
  PENDIENTE_REAUTORIZACION = 'PENDIENTE_REAUTORIZACION',
  BAJA = 'BAJA',
  FALLECIDO = 'FALLECIDO',
  SIN_INICIAR = 'SIN_INICIAR',
}
```

Nombre en `PascalCase`, valores en `UPPER_SNAKE_CASE`. Y se **usan** como enum,
no como string:

```typescript
// ❌ MAL
if (patient.queue === 'REAUTORIZAR') return

// ✅ BIEN
if (patient.queue === WorkQueue.REAUTORIZAR) return
```

### Enums que no existen en el backend

Los de puro orden o modo de UI (`PatientSortBy`, `ViewMode`) no tienen
contraparte: el sort es del lado cliente. Viven igual en el archivo de su dominio
y siguen las mismas reglas.

---

## Schemas Zod — uno por dominio, nunca inline

Todo schema vive en `src/schemas/<dominio>Schema.ts`. El backend tiene el schema
equivalente en `interfaces/http/schemas/` — **esas son las reglas reales**; el
frontend las replica (min/max/regex idénticos) para fallar antes de la request,
no para inventar validaciones propias.

```typescript
// src/schemas/patientSchema.ts
import { z } from 'zod'
import { UI_MESSAGES } from '@/lib/messages'
import { PatientStatus } from '@/types/patient'

export const createPatientSchema = z.object({
  firstName: z.string().min(2, { error: UI_MESSAGES.PATIENTS.FIRST_NAME_TOO_SHORT }),
  lastName: z.string().min(2, { error: UI_MESSAGES.PATIENTS.LAST_NAME_TOO_SHORT }),
  insuranceProviderId: z.uuid({ error: UI_MESSAGES.PATIENTS.INSURANCE_REQUIRED }),
  memberNumber: z.string().min(1, { error: UI_MESSAGES.PATIENTS.MEMBER_NUMBER_REQUIRED }),
  notes: z.string().default(''),
})

export type CreatePatientFormValues = z.infer<typeof createPatientSchema>

// ❌ MAL — schema inline dentro del componente
export default function NewPatientModal() {
  const schema = z.object({ firstName: z.string() })  // NUNCA
}
```

Cuando el schema tenga `.default()` o `.transform()`, exportar también el tipo de
entrada — `z.infer` da el tipo de **salida**, y react-hook-form necesita el de
entrada:

```typescript
export type CreatePatientFormValues = z.infer<typeof createPatientSchema>
export type CreatePatientFormInput  = z.input<typeof createPatientSchema>
```

### Un mensaje por cada validación real, nunca duplicado

Un mensaje por validación _distinta_, no uno por campo.

```typescript
// ❌ MAL — dos mensajes para lo que en la práctica es un solo problema
password: z.string({ error: UI_MESSAGES.AUTH.PASSWORD_REQUIRED })
           .min(1, { error: UI_MESSAGES.AUTH.PASSWORD_REQUIRED })

// ✅ BIEN — una validación real, un mensaje
password: z.string().min(1, { error: UI_MESSAGES.AUTH.PASSWORD_REQUIRED })

// ✅ BIEN — dos reglas genuinamente distintas, dos mensajes
warningDays: z.number()
  .min(1,   { error: UI_MESSAGES.AUTHORIZATIONS.WARNING_DAYS_TOO_LOW })
  .max(180, { error: UI_MESSAGES.AUTHORIZATIONS.WARNING_DAYS_TOO_HIGH })
```

---

## Zod v4 — sintaxis correcta

```typescript
z.email()             // antes: z.string().email()
z.url()               // antes: z.string().url()
z.uuid()              // antes: z.string().uuid()
z.iso.date()          // antes: z.string().date()
z.enum(MiEnum)        // antes: z.nativeEnum(MiEnum) — DEPRECADO
result.error.issues   // antes: result.error.errors
```

- `error` reemplaza a `message`, `invalid_type_error` y `errorMap`
- `.merge()` deprecado → `.extend()` o destructuring de `.shape`
- `z.record()` exige dos argumentos: `z.record(z.string(), z.number())`
- `z.enum()` acepta el enum de TypeScript directo. **Nunca** reescribir los
  valores a mano ni pasarle un `Object.values(...) as [string, ...string[]]`: el
  cast rompe el tipo — el campo queda `string` — y duplica lo que ya existe

---

## Arquitectura — Server y Client Components

```
Server Components (RSC)          carga inicial de datos vía serverFetch (SSR)
                                 sin Axios, sin Zustand, sin hooks de React
Client Components ('use client') interacción del usuario
                                 Axios + Zustand para mutaciones y estado
proxy.ts (raíz, no src/)         protección de rutas en Edge Runtime
```

| Situación                                          | Tipo             |
| -------------------------------------------------- | ---------------- |
| Dashboard: contadores, bandejas, reclamos           | Server Component |
| Listado inicial de pacientes                        | Server Component |
| Login, modales de alta/edición, cierre de episodio  | Client Component |
| Tabla con filtros u orden interactivos              | Client Component |
| Layout, sidebar, header sin estado                  | Server Component |
| Cualquier cosa con `useState`, `useEffect` o stores | Client Component |

El dashboard es **una sola llamada** (`GET /api/dashboard`): trae contadores,
corte por empresa, reclamos y bandejas. No se arma con N requests desde el
cliente.

### Regla de hidratación — el patrón Hydrator

Los datos van **siempre** en un solo sentido: Server Component → props → Client
Component. Nunca al revés.

La hidratación del store no se hace en el componente que consume los datos, sino
en un Client Component dedicado por dominio, `<Dominio>Hydrator.tsx`, que no
renderiza nada:

```typescript
// src/components/patients/PatientsHydrator.tsx
'use client'

import { useEffect } from 'react'
import { usePatientsStore } from '@/store/usePatientsStore'
import type { PatientListItem } from '@/types/patient'

interface PatientsHydratorProps {
  patients: PatientListItem[]
}

export default function PatientsHydrator({ patients }: PatientsHydratorProps) {
  const hydrate = usePatientsStore((state) => state.hydrate)

  useEffect(() => {
    hydrate(patients)
  }, [hydrate, patients])

  return null
}
```

El Server Component lo monta arriba del árbol y después renderiza la UI:

```typescript
// src/app/(protected)/patients/page.tsx — Server Component
export default async function PatientsPage() {
  let patients: PatientListItem[] = []
  try {
    const res = await serverFetch<PaginatedResponse<PatientListItem>>('/patients', {
      revalidate: false,
    })
    patients = res.data
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') redirect('/login')
    // otro error: seguir con array vacío, la UI muestra el mensaje de EMPTY
  }

  return (
    <>
      <PatientsHydrator patients={patients} />
      <PatientsTable />
    </>
  )
}
```

**Cuidado con `Suspense` alrededor de un componente hidratado**: la hidratación
selectiva del boundary corre después del `hydrate()` del store y causa mismatch.

---

## Zustand — convenciones

Un store por dominio, en `src/store/use<Dominio>Store.ts`, con `'use client'` en
la primera línea del archivo.

- **El estado inicial se hidrata desde el Server Component** vía `hydrate()`.
  Ningún store fetchea su propia carga inicial en un `useEffect`.
- **Los filtros y el orden son del lado cliente, en memoria** — no re-fetchean.
  Se implementan como **funciones puras exportadas del store**, no como métodos:
  un método devuelve una referencia nueva en cada render y re-renderiza de más.
  El componente se suscribe a los datos crudos y aplica la función pura.
- **Los componentes nunca llaman a Axios directo** — siempre vía el store.
- **Las mutaciones actualizan el estado local** con la respuesta del backend, sin
  re-fetch de la lista entera.
- **Las mutaciones propagan el mensaje del backend**: se hace `throw` con el
  `message` que vino en la respuesta, y `UI_MESSAGES` es el fallback. El
  componente lo captura y lo muestra en un toast. Los mensajes del backend están
  redactados para el operador y dicen **qué hacer** — pisarlos con uno genérico
  es perder información.
- `isLoading` / `error` solo existen en los stores que mutan. Un store de puro
  listado hidratado + filtros en memoria no los necesita: no los agregues por
  simetría.

### Cuándo un store necesita `refetch`

No por simetría. La pregunta es: **después de la mutación, ¿podés calcular el
estado nuevo con lo que devolvió la respuesta?**

- **Sí** → actualizás local, sin refetch.
- **No** → refetch, y **va en el store que disparó la mutación**, no en el que
  posee los datos. Cross-store siempre con `getState()`, nunca con el hook: corre
  fuera de React.

Caso típico de "no" en IDUtils: cerrar un episodio cambia el `status` y la
`queue` del paciente, y los dos son **derivados en el backend**. Ahí el store de
episodios refetchea el paciente en vez de adivinar la bandeja nueva.

---

## Mensajes de UI — lib/messages.ts

Todo string visible al usuario vive en `UI_MESSAGES`, agrupado por dominio, con
`as const`. Ningún componente ni schema define un literal propio.

```typescript
export const UI_MESSAGES = {
  AUTH:      { EMAIL_INVALID: '...', PASSWORD_REQUIRED: '...' },
  PATIENTS:  { FETCH_ERROR: '...', EMPTY: '...', FIRST_NAME_TOO_SHORT: '...' },
  EPISODES:  { CLOSE_ERROR: '...' },
  GENERAL:   { UNEXPECTED_ERROR: '...', LOADING: '...' },
} as const
```

Español rioplatense (voseo: "Iniciá", "Agregá", "Completá"), igual que los
mensajes del backend. Las claves en inglés, como todo el código.

---

## lib/serverFetch.ts — fetch tipado para Server Components

No usa Axios: Next.js extiende el `fetch` nativo con caché y revalidación.
Reenvía las cookies de la request entrante para autenticar contra el backend.

```
revalidate: number  → ISR, revalida cada N segundos
revalidate: false   → sin caché, fetch en cada request (SSR puro)
(sin opción)        → cachea hasta revalidación manual
```

El dashboard y las bandejas van con `revalidate: false`: son datos de
vencimientos, y un dato de vencimiento cacheado es un reclamo que no se hace.

---

## lib/api/client.ts — fetch con refresh y cola

Cliente único con URL validada por `config/apiUrl.ts` y
`credentials: 'include'` (obligatorio: sin eso el browser no manda las cookies
httpOnly). Cada endpoint entrega un parser Zod explícito; el borde de red no
castea JSON y un 204 nunca se afirma como un dato arbitrario.

El interceptor de respuesta, ante un 401:

1. Ignora los requests de `/auth/login` y `/auth/refresh` — si falla el refresh,
   reintentarlo es un loop.
2. Marca `_retry` para no reintentar dos veces el mismo request.
3. Si ya hay un refresh en curso, **encola** el request y lo reintenta cuando
   termina, en vez de disparar N refresh en paralelo.
4. Si el refresh falla, propaga el 401 sin reintentar el pedido original.

La generación del refresh conserva el vuelo ya terminado para que un 401 tardío
de la misma tanda no inicie otra rotación. Esto es obligatorio porque el backend
revoca la familia si recibe un refresh predecesor.

**Nunca** leer ni escribir `access_token` ni `refresh_token` desde JavaScript.

---

## proxy.ts — protección de rutas (Edge Runtime)

Vive en la raíz del proyecto, no en `src/`. Corre en Edge: **no puede validar el
JWT** (no tiene crypto), solo verifica que la cookie exista y, si el `exp` está
vencido, redirige **una sola vez** al Route Handler de refresh, que rota la
sesión, propaga todos los `Set-Cookie` y vuelve a la ruta original.

La firma y la vigencia reales las valida siempre el backend, y además **lee el
usuario de la base en cada pedido**: una baja o un cambio de rol tiene efecto
inmediato, no dentro de quince minutos. El proxy solo evita empezar un render con
un token vencido.

---

## react-hook-form + Zod

Todo formulario usa `react-hook-form` con `@hookform/resolvers/zod` y el schema
importado de `src/schemas/`. Nunca se duplica una regla de validación dentro del
componente.

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginFormValues } from '@/schemas/authSchema'

export default function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })
  // ...
}
```

Cuando el backend devuelve `details`, cada línea corresponde a un campo: el form
marca **todos** a la vez. Para eso se mandaron todos juntos.

---

## Convenciones de nombres

```
Archivos de Next.js:   minúscula fija       page.tsx, layout.tsx
Componentes React:     PascalCase           PatientsTable.tsx, LoginForm.tsx
Hydrators:             <Dominio>Hydrator    PatientsHydrator.tsx
Stores Zustand:        use+PascalCase+Store usePatientsStore.ts
Schemas:               <dominio>Schema.ts   patientSchema.ts
Tipos de dominio:      <dominio>.ts         patient.ts, episode.ts
Archivos lib/config:   camelCase            apiClient.ts, env.ts
Variables/funciones:   camelCase            fetchPatients(), closeEpisode()
Tipos/interfaces:      PascalCase           PatientListItem, DashboardSummary
Enums:                 PascalCase (nombre) + UPPER_SNAKE_CASE (valor)
```

**Los componentes se exportan siempre con `export default function`.** Las
funciones puras auxiliares de un store van con export nombrado.

Todo el código en inglés — variables, funciones, tipos, comentarios. Los mensajes
al usuario en español, centralizados en `lib/messages.ts`.

La regla es **nombre vs valor**: los nombres (campos, variables, funciones,
tipos, miembros de enum) van en inglés; los valores (contenido de un enum,
mensajes, labels, `id`/`htmlFor` de los formularios) van en español.

```typescript
export enum FrequencyUnit {   // nombre en inglés
  SEMANAL = 'SEMANAL',        // valor en español — lo define schema.prisma
}

<Label htmlFor="edit-apellido">Apellido</Label>  // texto de UI: español
{...register('lastName')}                         // campo del schema: inglés
```

---

## Variables de entorno

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

La única variable del frontend. Solo `NEXT_PUBLIC_*` llega al browser y queda
congelada durante `next build`. Producción falla si falta o es inválida; sólo
`NODE_ENV=development` tiene el fallback deliberado a `http://localhost:4000`.

---

## Este proyecto

**Dominio.** IDUtils no es un sistema de registro: es un sistema de
**vencimientos y reclamos** para coordinaciones de Internación Domiciliaria. La
pantalla que importa es la que dice **qué está por vencer y a quién hay que
reclamarlo**. No factura, no maneja stock, no arma agendas, no rutea móviles.

**Lo que llega derivado y no se recalcula acá.** `PatientStatus`, `WorkQueue` y
`AuthorizationStatus` los calcula el backend a partir de los episodios y las
autorizaciones. El frontend los muestra.

**Roles (D14).** `ADMIN` (todo) · `OPERADOR` (lectura + escritura) · `LECTOR`
(solo lectura, nunca escribe). La UI esconde lo que el rol no puede hacer, pero
**la restricción real la aplica el backend**: esconder un botón no es un permiso.

**Renovar es agregar, nunca editar.** No existe ningún `PUT` de autorización, y
la UI no puede ofrecer uno: pisar un `validUntil` borraría la línea de tiempo con
la que se defiende una auditoría. El formulario de renovación crea una fila
nueva.

**Dar de baja un paciente no es darle el alta.** `deactivate` es para un paciente
cargado por error (duplicado, persona equivocada). Si tiene episodios, el backend
devuelve 409 con el mensaje que dice qué hacer en su lugar: cerrar el episodio
con su motivo. Ese mensaje se muestra tal cual.

---

## Lo que NO existe en este proyecto

```
Backend propio · API routes de negocio · base de datos · Prisma
fetch nativo (salvo serverFetch, que es el fetch de Next) · localStorage
sessionStorage · Bearer tokens · JWT leído desde JavaScript
cookies escritas desde JavaScript · npm / yarn · kebab-case en componentes
imports relativos entre carpetas de src/ · z.nativeEnum()
mensajes hardcodeados · lógica de negocio en componentes
derivación de estado/bandeja/cobertura en el cliente
```

@AGENTS.md
