# syntax=docker/dockerfile:1

# IDUtils — backend.
#
# Tres etapas y DOS imagenes utiles:
#
#   build    tiene el codigo, las devDependencies y el CLI de Prisma. De aca
#            sale el servicio `migrate` del compose.
#   runtime  solo dependencias de produccion y `dist/`. De aca sale la API.
#
# La separacion no es estetica. El contenedor que atiende pedidos NO PUEDE
# migrar la base: no tiene el CLI de Prisma ni el schema para hacerlo. Un
# proceso expuesto a internet que ademas sabe alterar el esquema es una
# superficie de ataque que no hace falta tener.

# ---------------------------------------------------------------------------
FROM node:24-alpine AS base

# pnpm por version exacta, la misma que `packageManager` en package.json.
# Instalado con npm y no con corepack a proposito: corepack dejo de venir en
# las distribuciones recientes de Node, y un `corepack enable` que falla en la
# proxima imagen base es un build roto sin motivo aparente.
RUN npm install --global pnpm@11.20.0

WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS deps

# `pnpm-workspace.yaml` NO es opcional: lleva `minimumReleaseAge` (enfriamiento
# de versiones recien publicadas) y `allowBuilds`. Sin el, pnpm no aprueba el
# script de instalacion de argon2 y el modulo nativo queda sin resolver.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM deps AS build

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# `prisma.config.ts` resuelve `env('DATABASE_URL')` AL CARGARSE, asi que
# `prisma generate` falla sin ella aunque no la use para nada. Va un valor de
# mentira: es un ARG, no un ENV, y por eso no queda en la imagen final.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"

# `src/generated/` no viaja en el repo: el cliente se genera ACA, contra el
# schema de esta version. Copiarlo desde afuera es como una imagen termina
# corriendo un cliente que no coincide con su propio schema.
RUN pnpm prisma generate && pnpm build

# ---------------------------------------------------------------------------
FROM base AS runtime

ENV NODE_ENV=production

# El puerto es fijo adentro del contenedor. Publicarlo en otro es trabajo del
# compose: si tambien fuera variable adentro, el HEALTHCHECK tendria que
# adivinarlo.
ENV PORT=4000

# tini como PID 1. Node atiende SIGTERM por su cuenta, pero PID 1 tambien tiene
# que enterrar procesos huerfanos, y Node no lo hace: sin esto se acumulan
# zombies en un contenedor de larga vida.
RUN apk add --no-cache tini

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Los peers opcionales de @prisma/client son herramientas de desarrollo, no
# runtime del cliente generado. Se omiten junto con las devDependencies; el
# stage final se inspecciona durante la verificación para evitar que este
# supuesto quede únicamente en texto.
RUN pnpm install --frozen-lockfile --prod --no-optional

COPY --from=build --chown=node:node /app/dist ./dist

# Sin privilegios. Si algun dia hay una ejecucion remota de codigo, que sea
# como un usuario que no puede escribir ni su propio node_modules.
USER node

EXPOSE 4000

# `fetch` global de Node en vez de curl: una dependencia menos en la imagen y
# una superficie menos. Pega contra 127.0.0.1 y no contra el nombre del
# servicio: lo que se pregunta es si ESTE proceso responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
