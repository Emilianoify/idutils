-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('INTERNACION', 'ALTA_MEDICA', 'CAMBIO_OBRA_SOCIAL', 'FIN_COBERTURA', 'SUSPENSION_EMPRESA', 'BAJA_VOLUNTARIA', 'MUDANZA_FUERA_DE_ZONA', 'FALLECIMIENTO');

-- CreateEnum
CREATE TYPE "ServiceUnit" AS ENUM ('VISITA', 'SESION', 'HORA');

-- CreateEnum
CREATE TYPE "FrequencyUnit" AS ENUM ('SEMANAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERADOR', 'LECTOR');

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "documentNumber" TEXT,
    "birthDate" DATE,
    "addressStreet" TEXT NOT NULL,
    "addressDetail" TEXT,
    "localityId" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_contacts" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "patient_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insuranceProviderId" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "insurance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracting_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contracting_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_insurance_providers" (
    "id" TEXT NOT NULL,
    "contractingCompanyId" TEXT NOT NULL,
    "insuranceProviderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "company_insurance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_care_episodes" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "affiliationId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "closeReason" "CloseReason",
    "closeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "home_care_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_services" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "contractingCompanyId" TEXT NOT NULL,
    "professionalId" TEXT,
    "endedOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "care_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorizations" (
    "id" TEXT NOT NULL,
    "careServiceId" TEXT NOT NULL,
    "frequencyId" TEXT NOT NULL,
    "frequencyAmount" INTEGER NOT NULL,
    "frequencyUnit" "FrequencyUnit" NOT NULL,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "claimedAt" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceUnit" "ServiceUnit" NOT NULL DEFAULT 'VISITA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frequencies" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "unit" "FrequencyUnit" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "frequencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialty_frequencies" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "frequencyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "specialty_frequencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "documentNumber" TEXT,
    "licenseNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "bankAccount" TEXT,
    "bankAlias" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_specialties" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "professional_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provinces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERADOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patients_lastName_idx" ON "patients"("lastName");

-- CreateIndex
CREATE INDEX "patients_localityId_idx" ON "patients"("localityId");

-- CreateIndex
CREATE INDEX "patients_documentNumber_idx" ON "patients"("documentNumber");

-- CreateIndex
CREATE INDEX "patient_contacts_patientId_idx" ON "patient_contacts"("patientId");

-- CreateIndex
CREATE INDEX "affiliations_insuranceProviderId_memberNumber_idx" ON "affiliations"("insuranceProviderId", "memberNumber");

-- CreateIndex
CREATE INDEX "affiliations_patientId_idx" ON "affiliations"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_providers_name_key" ON "insurance_providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "contracting_companies_name_key" ON "contracting_companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "company_insurance_providers_contractingCompanyId_insuranceP_key" ON "company_insurance_providers"("contractingCompanyId", "insuranceProviderId");

-- CreateIndex
CREATE INDEX "home_care_episodes_patientId_idx" ON "home_care_episodes"("patientId");

-- CreateIndex
CREATE INDEX "home_care_episodes_affiliationId_idx" ON "home_care_episodes"("affiliationId");

-- CreateIndex
CREATE INDEX "home_care_episodes_startsOn_idx" ON "home_care_episodes"("startsOn");

-- CreateIndex
CREATE INDEX "care_services_episodeId_idx" ON "care_services"("episodeId");

-- CreateIndex
CREATE INDEX "care_services_contractingCompanyId_idx" ON "care_services"("contractingCompanyId");

-- CreateIndex
CREATE INDEX "care_services_specialtyId_idx" ON "care_services"("specialtyId");

-- CreateIndex
CREATE INDEX "care_services_professionalId_idx" ON "care_services"("professionalId");

-- CreateIndex
CREATE INDEX "authorizations_careServiceId_idx" ON "authorizations"("careServiceId");

-- CreateIndex
CREATE INDEX "authorizations_validUntil_idx" ON "authorizations"("validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "frequencies_amount_unit_key" ON "frequencies"("amount", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "specialty_frequencies_specialtyId_frequencyId_key" ON "specialty_frequencies"("specialtyId", "frequencyId");

-- CreateIndex
CREATE INDEX "professionals_lastName_idx" ON "professionals"("lastName");

-- CreateIndex
CREATE UNIQUE INDEX "professional_specialties_professionalId_specialtyId_key" ON "professional_specialties"("professionalId", "specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "provinces_name_key" ON "provinces"("name");

-- CreateIndex
CREATE INDEX "localities_name_idx" ON "localities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "localities_provinceId_name_key" ON "localities"("provinceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_contacts" ADD CONSTRAINT "patient_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_insuranceProviderId_fkey" FOREIGN KEY ("insuranceProviderId") REFERENCES "insurance_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_insurance_providers" ADD CONSTRAINT "company_insurance_providers_contractingCompanyId_fkey" FOREIGN KEY ("contractingCompanyId") REFERENCES "contracting_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_insurance_providers" ADD CONSTRAINT "company_insurance_providers_insuranceProviderId_fkey" FOREIGN KEY ("insuranceProviderId") REFERENCES "insurance_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_care_episodes" ADD CONSTRAINT "home_care_episodes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_care_episodes" ADD CONSTRAINT "home_care_episodes_affiliationId_fkey" FOREIGN KEY ("affiliationId") REFERENCES "affiliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_services" ADD CONSTRAINT "care_services_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "home_care_episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_services" ADD CONSTRAINT "care_services_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_services" ADD CONSTRAINT "care_services_contractingCompanyId_fkey" FOREIGN KEY ("contractingCompanyId") REFERENCES "contracting_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_services" ADD CONSTRAINT "care_services_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_careServiceId_fkey" FOREIGN KEY ("careServiceId") REFERENCES "care_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "frequencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialty_frequencies" ADD CONSTRAINT "specialty_frequencies_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialty_frequencies" ADD CONSTRAINT "specialty_frequencies_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "frequencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_specialties" ADD CONSTRAINT "professional_specialties_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
