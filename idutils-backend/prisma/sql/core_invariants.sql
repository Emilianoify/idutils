-- Invariantes del core que Prisma no sabe expresar.
--
-- Van en la BASE y no en la aplicacion a proposito: una validacion de
-- aplicacion se saltea desde un script, desde el seed, desde una consola de
-- soporte o desde el import. Una constraint no.
--
-- COMO SE APLICA (una sola vez, al crear la migracion inicial):
--
--   pnpm prisma migrate dev --create-only --name init
--   cat prisma/sql/core_invariants.sql >> prisma/migrations/<ts>_init/migration.sql
--   pnpm prisma migrate dev
--
-- Este archivo queda versionado como la fuente de estas reglas. La migracion
-- es la copia que corre; esta es la que se lee cuando alguien pregunta por que.

-- Requerida por el EXCLUDE de abajo: permite combinar un operador de igualdad
-- (=) con uno de solapamiento (&&) en el mismo indice GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- D9 - No hay episodios de ID solapados por paciente
-- ---------------------------------------------------------------------------
-- Un paciente no puede estar en dos internaciones domiciliarias a la vez. El
-- rango es semiabierto '[)': un episodio que cierra el 18/1 y otro que abre el
-- 18/1 NO se solapan, que es exactamente como se lee un reingreso.
--
-- endsOn NULL = episodio abierto = rango sin cota superior. Dos episodios
-- abiertos del mismo paciente se solapan siempre, y por eso esto tambien
-- garantiza "un solo episodio abierto por paciente" sin una regla aparte.
ALTER TABLE "home_care_episodes"
  ADD CONSTRAINT "no_overlapping_episodes"
  EXCLUDE USING gist (
    "patientId" WITH =,
    daterange("startsOn", "endsOn", '[)') WITH &&
  ) WHERE ("deletedAt" IS NULL);

-- El motivo de cierre no es un dato opcional: es lo que califica el hueco
-- (D9, consecuencia 2). Sin el, un episodio cerrado podria ser una internacion,
-- una baja o un cambio de obra social, y la bandeja de trabajo no existe.
ALTER TABLE "home_care_episodes"
  ADD CONSTRAINT "close_reason_matches_end_date"
  CHECK (("endsOn" IS NULL) = ("closeReason" IS NULL));

ALTER TABLE "home_care_episodes"
  ADD CONSTRAINT "episode_ends_after_start"
  CHECK ("endsOn" IS NULL OR "endsOn" > "startsOn");

-- ---------------------------------------------------------------------------
-- D8 - Unicidad de la afiliacion ENTRE LAS VIGENTES
-- ---------------------------------------------------------------------------
-- Parcial a proposito. El paciente puede volver a la misma obra social con el
-- mismo numero de afiliado anos despues: eso son dos filas legitimas, y un
-- unique total las prohibiria y obligaria a pisar el historial.
CREATE UNIQUE INDEX "affiliations_current_member_number_key"
  ON "affiliations" ("insuranceProviderId", "memberNumber")
  WHERE "to" IS NULL AND "deletedAt" IS NULL;

ALTER TABLE "affiliations"
  ADD CONSTRAINT "affiliation_ends_after_start"
  CHECK ("to" IS NULL OR "to" > "from");

-- ---------------------------------------------------------------------------
-- D7 - Unicidad de la prestacion ENTRE LAS ACTIVAS
-- ---------------------------------------------------------------------------
-- La empresa entra en la clave a proposito: el mismo paciente puede recibir
-- kinesiologia por SanityCare y enfermeria por Gamad en el mismo episodio.
-- Dejarla afuera es el mismo error de clave incompleta que ya costo caro.
CREATE UNIQUE INDEX "care_services_active_key"
  ON "care_services" ("episodeId", "specialtyId", "contractingCompanyId")
  WHERE "endedOn" IS NULL AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- D10 - Coherencia del periodo autorizado
-- ---------------------------------------------------------------------------
-- Una autorizacion que vence antes de empezar no es un dato raro: es un error
-- de carga que despues aparece como "vencida" en el dashboard y hace que
-- alguien reclame algo que nunca existio.
ALTER TABLE "authorizations"
  ADD CONSTRAINT "authorization_valid_period"
  CHECK ("validUntil" >= "validFrom");

ALTER TABLE "authorizations"
  ADD CONSTRAINT "authorization_frequency_amount_positive"
  CHECK ("frequencyAmount" > 0);

ALTER TABLE "frequencies"
  ADD CONSTRAINT "frequency_amount_positive"
  CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- D15 - Un solo contacto principal por paciente
-- ---------------------------------------------------------------------------
-- "El principal" en singular. Dos principales es lo mismo que ninguno: hay que
-- elegir a mano igual, que es justo lo que la lista de contactos vino a evitar.
CREATE UNIQUE INDEX "patient_contacts_single_primary_key"
  ON "patient_contacts" ("patientId")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;
