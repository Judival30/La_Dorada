# ADR-009: Resets de la base de datos de pruebas y de desarrollo

- Estado: Aceptada
- Fecha: 2026-10-27

## Contexto

Las pruebas de integración necesitan un esquema limpio y reproducible. Prisma bloquea `migrate reset` cuando lo ejecuta un agente de IA, salvo consentimiento explícito del usuario (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`).

## Decisión

- `pnpm test:int` (`src/test/int-setup.ts`) descarta y recrea el esquema `public` de la base indicada en `DATABASE_URL_TEST` y luego ejecuta `prisma migrate deploy`. Se niega a operar si el nombre de la base no termina en `_test`.
- Los resets de la base de desarrollo (`pnpm db:reset`, `pnpm demo:reset`) destruyen datos y requieren consentimiento explícito del usuario cuando los ejecuta un agente de IA.

## Consecuencias

- Las pruebas de integración no necesitan consentimiento y nunca tocan la base de desarrollo.
- `DATABASE_URL_TEST` mal configurada hacia una base que no termina en `_test` aborta la suite.
- Un agente que necesite resetear la base de desarrollo debe pedirlo al usuario.
