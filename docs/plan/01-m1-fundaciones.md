# M0+M1 Descubrimiento y Fundaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listo el esqueleto ejecutable de La Dorada: documentación de decisiones, proyecto Next.js con Docker y CI, dominio puro (dinero, máquinas de estado, políticas, valoración/score), esquema de datos completo con bitácora append-only, autenticación con sesiones y login por rol sobre un shell visual de marca, y datos seed.

**Architecture:** Monolito Next.js modular. `src/domain` es puro y se prueba con Vitest sin I/O; `src/server` hace I/O (Prisma, sesiones, auditoría); `src/app` monta rutas por rol con guardas en los layouts de servidor. Toda mutación posterior seguirá el flujo Zod → política → transición → escritura + AuditLog en una transacción.

**Tech Stack:** Node 24, pnpm, Next.js 15 (App Router) + TypeScript estricto, Tailwind CSS v4 + shadcn/ui, Prisma 6 + PostgreSQL 16, MinIO, Mailpit, Vitest, Playwright, `@node-rs/argon2`, Zod, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-26-la-dorada-design.md`

## Global Constraints

- UI y datos de demo en español de Colombia; código, nombres técnicos y commits en inglés (Conventional Commits).
- Moneda COP; formato `COP 12.000 M` (millones, separador de miles `.`). Montos en BD como `BigInt` en pesos.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`.
- Validación con Zod en todos los bordes (formularios, route handlers, variables de entorno).
- Ningún dato personal real: todo dato de demo es ficticio (NIT con prefijo `900.`).
- Roles: `BUYER | SELLER | BACKOFFICE`. Valores de enums de estado idénticos entre `src/domain` y Prisma (MAYÚSCULAS, inglés).
- Toda mutación escribe `AuditLog` en la misma transacción; `AuditLog` es append-only (trigger SQL).
- El Back Office nunca transiciona estados de negociación (R4).
- Scripts npm multiplataforma (Windows + Linux): nada de `rm -rf`, `export`, `&&` dependiente de bash dentro de `package.json` salvo encadenado simple.
- Sin push ni PR. Rama `m1-foundations` en worktree `.worktrees/m1-foundations`.
- Componentes visuales: cargar la skill `frontend-design` y seguir `docs/design-system.md`.

## Review Focus

1. **Escrituras concurrentes en la bitácora**: 20 escrituras paralelas no deben bifurcar la cadena de hashes → `verifyAuditChain` devuelve `ok: true` (test en Task 7).
2. **Robo de la tabla de sesiones**: la BD nunca guarda el token en claro, solo su SHA-256 (test en Task 8).
3. **Fuerza bruta en login**: el 6.º intento en 60 s para el mismo IP+email se rechaza con mensaje genérico, aunque la contraseña sea correcta (test en Task 8).
4. **`BigInt` hacia el cliente**: `JSON.stringify` lanza con `bigint`; todo DTO pasa por `toDTO`, que convierte `bigint` a `string` (test en Task 3).
5. **Usuario bloqueado con sesión viva**: al bloquear se invalidan sus sesiones y `requireUser` rechaza cualquier estado distinto de `ENABLED` en rutas de rol (test en Task 8).

---

### Task 0: Documentos de decisión y trazabilidad (M0)

**Modelo:** haiku · **Files:**
- Create: `docs/adr/001-monolito-nextjs.md`, `docs/adr/002-auth-sesiones.md`, `docs/adr/003-integraciones-simuladas.md`, `docs/adr/004-tiempo-real-sse.md`, `docs/adr/005-valoracion-score.md`, `docs/adr/006-repo-y-onedrive.md`, `docs/adr/007-defaults-brainstorming.md`
- Create: `docs/arquitectura.md`, `docs/trazabilidad.md`, `docs/preguntas-abiertas.md`

**Interfaces:**
- Produces: `docs/trazabilidad.md` con tabla `| H | Rol | Módulo | Pantalla (ruta) | Endpoint / action | Test E2E | Milestone | Estado |`, una fila por H1–H15, rutas y milestone tomados de spec §9 y §12, columnas Endpoint y Test con `pendiente (Mx)`.

- [ ] **Step 1:** Escribir cada ADR (formato: Contexto · Decisión · Consecuencias, ≤ 30 líneas) a partir de spec §3.1–3.4, §7 y las decisiones del usuario (git propio, monolito, esqueleto primero, defaults §7: Docker + guía Vercel/Railway, firma simulada sello+SHA-256, Jitsi, KYC manual, múltiplos por sector, 15 empresas ficticias).
- [ ] **Step 2:** `docs/arquitectura.md`: copiar capas (§3.1), flujo de mutación, diagramas Mermaid de §5 y la fórmula de §7.
- [ ] **Step 3:** `docs/preguntas-abiertas.md` con estas entradas (pregunta · decisión provisional · fuente):
  1. Valoración del pitch (COP 180.000–320.000 M con ingresos COP 12.000 M) incoherente con múltiplos → manda la fórmula (§7).
  2. El prompt no define la navegación del vendedor → se usa la de spec §8.
  3. Acceso confidencial con oportunidad `SUSPENDED` → se bloquea (solo `PUBLISHED` y `CLOSED` permiten acceso).
  4. ¿Puede desistir el vendedor? "Sistema general" paso 10 y recorrido vendedor 07 → sí, ambas partes.
- [ ] **Step 4:** `docs/trazabilidad.md` según Interfaces.
- [ ] **Step 5: Commit** `docs: add ADRs, architecture, traceability and open questions`

---

### Task 1: Scaffold, calidad y CI

**Modelo:** sonnet · **Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`, `src/lib/utils.ts` (shadcn `cn`), `components.json`, `.github/workflows/ci.yml`
- Test: `src/app/api/health/route.test.ts`

**Interfaces:**
- Produces scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run, solo `src/**/*.test.ts`), `test:int` (Task 7), `e2e` (Task 10), `db:migrate`, `db:reset`, `seed`, `demo:reset` (Task 9).
- Produces `GET /api/health` → `200 { status: "ok" }` (la comprobación de BD se agrega en Task 7).

- [ ] **Step 1:** `pnpm create next-app` (TS, App Router, Tailwind, ESLint, `src/`, alias `@/*`), luego `pnpm dlx shadcn@latest init`. Activar `noUncheckedIndexedAccess`. Agregar Vitest + Prettier.
- [ ] **Step 2: Test que falla** `route.test.ts`: `const res = await GET(); expect(res.status).toBe(200); expect(await res.json()).toEqual({ status: 'ok' })`.
- [ ] **Step 3:** Ejecutar `pnpm test` → FAIL (módulo no existe). Implementar `GET` en `src/app/api/health/route.ts`. Ejecutar → PASS.
- [ ] **Step 4:** `ci.yml`: en push/PR, Node 24 + pnpm, `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build`.
- [ ] **Step 5:** Verificar `pnpm lint && pnpm typecheck && pnpm test && pnpm build` → todo en verde.
- [ ] **Step 6: Commit** `chore: scaffold Next.js app with tooling and CI`

---

### Task 2: Docker Compose y entorno

**Modelo:** sonnet · **Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `docker/db-init.sql`, `src/server/env.ts`
- Test: `src/server/env.test.ts`

**Interfaces:**
- Produces `env` (objeto validado con Zod) con: `DATABASE_URL`, `DATABASE_URL_TEST`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` (default `ladorada-private`), `SMTP_HOST`, `SMTP_PORT`, `APP_URL`, `SESSION_TTL_DAYS` (default 7), `ADAPTERS_MODE` (`mock`). Export `parseEnv(raw: Record<string, string | undefined>): Env`.
- Servicios: `db` (postgres:16, puerto 5432, crea BD `ladorada` y `ladorada_test` vía script en `docker/db-init.sql`), `minio` (9000/9001, crea bucket privado con job `minio-init` usando `mc`), `mailpit` (1025/8025), `app` (Dockerfile multi-stage `node:24-alpine`, depende de los anteriores, ejecuta migraciones al iniciar).

- [ ] **Step 1: Test que falla** `env.test.ts`: `parseEnv` con un objeto completo devuelve `SESSION_TTL_DAYS === 7` cuando falta; con `DATABASE_URL` ausente lanza `ZodError`.
- [ ] **Step 2:** `pnpm test src/server/env.test.ts` → FAIL. Implementar. → PASS.
- [ ] **Step 3:** Escribir compose, Dockerfile y `docker/db-init.sql`. Verificar `docker compose up -d db minio mailpit` y `docker compose ps` → 3 servicios `healthy`/`running`; bucket `ladorada-private` sin política pública (`mc anonymous get local/ladorada-private` → `private`).
- [ ] **Step 4: Commit** `chore: add docker compose stack and validated env`

---

### Task 3: Primitivas de dominio (dinero, errores, roles, DTO)

**Modelo:** sonnet · **Files:**
- Create: `src/domain/money.ts`, `src/domain/errors.ts`, `src/domain/roles.ts`, `src/server/dto.ts`
- Test: `src/domain/money.test.ts`, `src/server/dto.test.ts`

**Interfaces:**
- Produces:
  - `formatCOP(pesos: bigint): string` y `millions(m: number): bigint`
  - `type Role = 'BUYER' | 'SELLER' | 'BACKOFFICE'`; `type Actor = Role | 'SYSTEM'`
  - Clases: `DomainError` (base, `code: string`), `ForbiddenError` (`code='FORBIDDEN'`), `InvalidTransitionError(machine: string, from: string, event: string)` (`code='INVALID_TRANSITION'`), `NotFoundError`, `ValidationError`
  - `toDTO<T>(value: T): Serialized<T>` (recursivo: `bigint` → `string`, `Date` → ISO string)

- [ ] **Step 1: Tests que fallan:**
```ts
expect(formatCOP(millions(12000))).toBe('COP 12.000 M')
expect(formatCOP(millions(2100))).toBe('COP 2.100 M')
expect(formatCOP(millions(180000))).toBe('COP 180.000 M')
expect(formatCOP(850_000n)).toBe('COP 850.000')
expect(formatCOP(millions(-200))).toBe('-COP 200 M')
expect(JSON.stringify(toDTO({ a: 5n, d: new Date('2026-01-02T00:00:00Z') }))).toBe('{"a":"5","d":"2026-01-02T00:00:00.000Z"}')
```
- [ ] **Step 2:** Ejecutar → FAIL. Implementar (≥ 1.000.000 pesos: millones redondeados al entero, agrupado con `.`; si no, pesos completos). → PASS.
- [ ] **Step 3: Commit** `feat(domain): add COP money formatting, domain errors and DTO serialization`

---

### Task 4: Máquinas de estado

**Modelo:** opus · **Files:**
- Create: `src/domain/state-machine.ts`, `src/domain/machines/user.ts`, `src/domain/machines/opportunity.ts`, `src/domain/machines/access.ts`, `src/domain/machines/deal.ts`
- Test: `src/domain/machines/*.test.ts`

**Interfaces:**
- Consumes: `Actor`, `InvalidTransitionError`, `ForbiddenError` (Task 3).
- Produces:
```ts
type TransitionDef<S, E> = { from: S | readonly S[]; event: E; to: S; actors: readonly Actor[] }
defineMachine<S extends string, E extends string>(name: string, states: readonly S[], defs: readonly TransitionDef<S, E>[]): Machine<S, E>
interface Machine<S, E> {
  name: string; states: readonly S[]
  transition(from: S, event: E, actor: Actor): S   // InvalidTransitionError si no hay def para (from,event); ForbiddenError si el actor no está permitido
  can(from: S, event: E, actor: Actor): boolean
  availableEvents(from: S, actor: Actor): E[]
}
export const userMachine, opportunityMachine, accessMachine, dealMachine
export type UserStatus, OpportunityStatus, AccessStatus, DealStatus (y sus Event types)
```
- Estados y eventos (exactos; también los usará Prisma):
  - **User** `PENDING, IN_REVIEW, CORRECTIONS_REQUESTED, ENABLED, REJECTED, BLOCKED`. `SUBMIT` PENDING→IN_REVIEW [BUYER,SELLER]; `REQUEST_CORRECTIONS` IN_REVIEW→CORRECTIONS_REQUESTED [BACKOFFICE]; `RESUBMIT` CORRECTIONS_REQUESTED→IN_REVIEW [BUYER,SELLER]; `APPROVE` IN_REVIEW→ENABLED [BACKOFFICE]; `REJECT` IN_REVIEW→REJECTED [BACKOFFICE]; `BLOCK` ENABLED→BLOCKED [BACKOFFICE]; `UNBLOCK` BLOCKED→ENABLED [BACKOFFICE].
  - **Opportunity** `DRAFT, IN_REVIEW, ADJUSTMENTS_REQUESTED, PUBLISHED, REJECTED, SUSPENDED, WITHDRAWN_BY_SELLER, CLOSED`. `SUBMIT` DRAFT→IN_REVIEW [SELLER]; `REQUEST_ADJUSTMENTS` IN_REVIEW→ADJUSTMENTS_REQUESTED [BACKOFFICE]; `RESUBMIT` ADJUSTMENTS_REQUESTED→IN_REVIEW [SELLER]; `APPROVE_AND_PUBLISH` IN_REVIEW→PUBLISHED [BACKOFFICE]; `REJECT` IN_REVIEW→REJECTED [BACKOFFICE]; `SUSPEND` PUBLISHED→SUSPENDED [BACKOFFICE]; `REINSTATE` SUSPENDED→PUBLISHED [BACKOFFICE]; `WITHDRAW` PUBLISHED→WITHDRAWN_BY_SELLER [SELLER]; `CLOSE` PUBLISHED→CLOSED [SYSTEM].
  - **Access** `REQUESTED, NDA_SIGNED, AUTHORIZED, REJECTED, REVOKED`. `SIGN_NDA` REQUESTED→NDA_SIGNED [BUYER]; `APPROVE` NDA_SIGNED→AUTHORIZED [SELLER]; `REJECT` [REQUESTED,NDA_SIGNED]→REJECTED [SELLER]; `REVOKE` AUTHORIZED→REVOKED [SELLER,BACKOFFICE].
  - **Deal** `OFFER_SENT, COUNTER_OFFER, PRELIMINARY_AGREEMENT, LOI_SIGNED, DUE_DILIGENCE, CLOSED, WITHDRAWN`. `COUNTER` OFFER_SENT→COUNTER_OFFER [SELLER]; `COUNTER` COUNTER_OFFER→OFFER_SENT [BUYER]; `ACCEPT` [OFFER_SENT,COUNTER_OFFER]→PRELIMINARY_AGREEMENT [BUYER,SELLER]; `SIGN_LOI` PRELIMINARY_AGREEMENT→LOI_SIGNED [BUYER,SELLER]; `START_DD` LOI_SIGNED→DUE_DILIGENCE [BUYER,SELLER]; `RENEGOTIATE` DUE_DILIGENCE→COUNTER_OFFER [BUYER,SELLER]; `CONFIRM_CLOSE` DUE_DILIGENCE→CLOSED [BUYER,SELLER]; `WITHDRAW` [todos los no terminales]→WITHDRAWN [BUYER,SELLER]. Ninguna def incluye BACKOFFICE.
  - Quién es "contraparte" en `ACCEPT` y la doble firma de LOI/cierre las resuelven los services (M4), no la máquina.

- [ ] **Step 1: Tests que fallan** (uno por máquina, tabla de casos con `it.each`):
  - Cada transición listada arriba devuelve el estado destino con cada actor permitido.
  - `userMachine.transition('PENDING','APPROVE','BACKOFFICE')` lanza `InvalidTransitionError`.
  - `opportunityMachine.transition('IN_REVIEW','APPROVE_AND_PUBLISH','SELLER')` lanza `ForbiddenError` (R1).
  - Para cada evento de `dealMachine` y cada estado, `can(state, event, 'BACKOFFICE') === false` (R4).
  - `dealMachine.transition(s,'WITHDRAW','BUYER') === 'WITHDRAWN'` para los 5 estados no terminales; desde `CLOSED` y `WITHDRAWN` lanza `InvalidTransitionError` (R5).
  - `accessMachine.availableEvents('AUTHORIZED','BACKOFFICE')` es `['REVOKE']`.
  - `defineMachine` lanza si dos defs comparten (from, event, actor) o si un `to` no está en `states`.
- [ ] **Step 2:** `pnpm test src/domain/machines` → FAIL. Implementar. → PASS, cobertura 100 % de `src/domain/machines` y `state-machine.ts` (`pnpm test --coverage`).
- [ ] **Step 3: Commit** `feat(domain): add state machines for user, opportunity, access and deal`

---

### Task 5: Políticas de acceso

**Modelo:** opus · **Files:**
- Create: `src/domain/policies/confidential.ts`, `src/domain/policies/parties.ts`, `src/domain/policies/roles.ts`
- Test: `src/domain/policies/*.test.ts`

**Interfaces:**
- Consumes: estados de Task 4, `Role`, `ForbiddenError`.
- Produces:
```ts
type NdaInfo = { signedAt: Date | null; expiresAt: Date | null }
ndaState(nda: NdaInfo | null, now: Date): 'PENDING' | 'SIGNED' | 'EXPIRED'
canAccessConfidential(ctx: {
  user: { id: string; role: Role; status: UserStatus }
  opportunity: { sellerId: string; status: OpportunityStatus }
  access: { status: AccessStatus } | null
  nda: NdaInfo | null
  now: Date
}): boolean
isPartyConflict(userId: string, opportunity: { sellerId: string }): boolean
assertRole(user: { role: Role; status: UserStatus }, ...roles: Role[]): void   // ForbiddenError si rol no permitido o status !== 'ENABLED'
```
- `canAccessConfidential` es `true` solo si: user `BUYER` y `ENABLED`; no es el vendedor; opportunity `PUBLISHED` o `CLOSED`; access `AUTHORIZED`; `ndaState === 'SIGNED'`.

- [ ] **Step 1: Tests que fallan:** caso base válido → `true`; luego un test por condición rota (8 casos) → `false`: user `BLOCKED`; rol `SELLER`; rol `BACKOFFICE`; user es el vendedor; opp `SUSPENDED`; access `NDA_SIGNED`; access `REVOKED`; NDA con `expiresAt` = `now` (vencido justo en el límite); `nda === null`. `ndaState` con `signedAt` null → `'PENDING'`. `assertRole` con status `IN_REVIEW` lanza `ForbiddenError`.
- [ ] **Step 2:** Ejecutar → FAIL. Implementar. → PASS, cobertura 100 % en `src/domain/policies`.
- [ ] **Step 3: Commit** `feat(domain): add confidential access gate and role policies`

---

### Task 6: Valoración y score

**Modelo:** opus · **Files:**
- Create: `src/domain/sectors.ts`, `src/domain/valuation.ts`
- Test: `src/domain/valuation.test.ts`

**Interfaces:**
- Produces:
```ts
type Sector = 'AGROINDUSTRIA' | 'ALIMENTOS_BEBIDAS' | 'LOGISTICA' | 'SERVICIOS_FINANCIEROS' | 'MANUFACTURA' | 'TECNOLOGIA' | 'SALUD' | 'RETAIL' | 'CONSTRUCCION' | 'ENERGIA'
type SectorMultiples = { ebitdaLow: number; ebitdaHigh: number; revenueLow: number; revenueHigh: number }
const DEFAULT_SECTOR_MULTIPLES: Record<Sector, SectorMultiples>
const SECTOR_LABELS: Record<Sector, string>        // es-CO: 'Agroindustria', 'Alimentos y Bebidas', 'Logística', 'Servicios Financieros', ...
cagr(first: bigint, last: bigint, years: number): number
valuationRange(input: { revenue: bigint; ebitda: bigint; cagr3y: number }, m: SectorMultiples): { low: bigint; high: bigint; basis: 'EBITDA' | 'REVENUE' }
type MatrixStatus = 'APPROVED' | 'TO_CLARIFY' | 'RISK'
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'TO_CLARIFY'
type ScoreInput = { docsDelivered: number; docsRequired: number; financialConsistency: MatrixStatus; cagr3y: number; ebitdaMargin: number; customerDependency: RiskLevel; legalContingencies: RiskLevel }
type ScoreWeights = { infoQuality: number; consistency: number; growth: number; margin: number; risks: number }
const DEFAULT_SCORE_WEIGHTS: ScoreWeights   // 0.30, 0.25, 0.15, 0.15, 0.15
computeScore(input: ScoreInput, w?: ScoreWeights): { total: number; breakdown: Record<keyof ScoreWeights, number> }
const VALUATION_DISCLAIMER = 'Orientativo. No es asesoría financiera regulada ni obliga a comprar o vender.'
```
- Múltiplos EBITDA (low–high) / ingresos (low–high): AGROINDUSTRIA 5–7 / 0.8–1.5; ALIMENTOS_BEBIDAS 6–9 / 1–2; LOGISTICA 5–7.5 / 0.6–1.2; SERVICIOS_FINANCIEROS 8–12 / 2–4; MANUFACTURA 4.5–6.5 / 0.5–1; TECNOLOGIA 8–14 / 2–5; SALUD 7–10 / 1–2.5; RETAIL 5–8 / 0.3–0.8; CONSTRUCCION 4–6 / 0.4–0.9; ENERGIA 6–9 / 1–2.5.
- Algoritmo `valuationRange`: base = EBITDA × [low, high] si EBITDA > 0, si no ingresos × [revenueLow, revenueHigh]; factor 1.10 si `cagr3y > 0.15`, 0.90 si `cagr3y < 0`, 1 en otro caso; redondear cada extremo al múltiplo de COP 100 M más cercano. Usar aritmética entera (`bigint`) multiplicando los múltiplos por 1000 para no perder precisión.
- Algoritmo `computeScore`: infoQuality = 100·delivered/required (0 si required = 0); consistency APPROVED 100 / TO_CLARIFY 50 / RISK 25; growth = clamp(cagr, −0.10, 0.30) mapeado lineal a 0–100; margin = clamp(margen, 0, 0.30) mapeado a 0–100; risks = promedio de los dos niveles (LOW 100, MEDIUM 60, HIGH 20, TO_CLARIFY 40); total = `Math.round(Σ peso·componente)`.

- [ ] **Step 1: Tests que fallan:**
```ts
const ab = DEFAULT_SECTOR_MULTIPLES.ALIMENTOS_BEBIDAS
expect(valuationRange({ revenue: millions(12000), ebitda: millions(2100), cagr3y: 0.18 }, ab)).toEqual({ low: millions(13900), high: millions(20800), basis: 'EBITDA' })
expect(valuationRange({ revenue: millions(8000), ebitda: millions(-200), cagr3y: 0.40 }, DEFAULT_SECTOR_MULTIPLES.SERVICIOS_FINANCIEROS)).toEqual({ low: millions(17600), high: millions(35200), basis: 'REVENUE' })
expect(valuationRange({ revenue: millions(9000), ebitda: millions(1000), cagr3y: -0.05 }, DEFAULT_SECTOR_MULTIPLES.AGROINDUSTRIA)).toEqual({ low: millions(4500), high: millions(6300), basis: 'EBITDA' })
expect(cagr(millions(18000), millions(42000), 4)).toBeCloseTo(0.236, 3)
const base: ScoreInput = { docsDelivered: 26, docsRequired: 30, financialConsistency: 'APPROVED', cagr3y: 0.18, ebitdaMargin: 0.175, customerDependency: 'MEDIUM', legalContingencies: 'TO_CLARIFY' }
const s = computeScore(base)
expect(s.total).toBe(78)
expect(s.breakdown).toEqual({ infoQuality: expect.closeTo(86.67, 2), consistency: 100, growth: 70, margin: expect.closeTo(58.33, 2), risks: 50 })
expect(computeScore({ ...base, docsRequired: 0, docsDelivered: 0 }).breakdown.infoQuality).toBe(0)
```
- [ ] **Step 2:** Ejecutar → FAIL. Implementar. → PASS.
- [ ] **Step 3: Commit** `feat(domain): add deterministic valuation range and score`

---

### Task 7: Esquema Prisma, bitácora append-only y BD de pruebas

**Modelo:** opus · **Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/*` (generada) + migración SQL manual `audit_log_append_only`, `src/server/db.ts`, `src/server/audit/audit.ts`, `vitest.integration.config.ts`, `src/test/int-setup.ts`
- Modify: `src/app/api/health/route.ts` (agrega `db: 'up' | 'down'`)
- Test: `src/server/audit/audit.int.test.ts`

**Interfaces:**
- Consumes: enums de Tasks 4 y 6 (mismos literales en Prisma), `Role`.
- Produces:
  - Modelos de spec §4 completos (todos, aunque se usen en milestones posteriores): `User, Session, Organization, BuyerPreferences, VerificationCase, VerificationDocument, KycChecklistItem, Company, CompanyFinancialYear, Opportunity, InfoSectionVisibility, DataRoomFolder, Document, Evaluation, EvaluationItem, Favorite, AccessRequest, NdaSignature, Deal, Offer, Loi, DealChecklistItem, Milestone, Question, Answer, Thread, Message, Meeting, Notification, Task, Incident, AuditLog, Setting`. Montos `BigInt`. Únicos: `Favorite(buyerId, opportunityId)`, `AccessRequest(buyerId, opportunityId)`, `CompanyFinancialYear(companyId, year)`, `Session(tokenHash)`. `Setting` como `key String @id, value Json`.
  - `db: PrismaClient` (singleton en `src/server/db.ts`).
  - `writeAudit(tx: Prisma.TransactionClient, e: { actorId: string | null; action: string; entity: string; entityId: string; before?: unknown; after?: unknown; ip?: string | null }): Promise<AuditLog>` — toma `pg_advisory_xact_lock(7240001)`, lee el último `hash`, calcula `hash = sha256(prevHash + canonicalJson({at, actorId, action, entity, entityId, before, after, ip}))`.
  - `verifyAuditChain(client?: PrismaClient): Promise<{ ok: boolean; brokenAt?: string }>`.
  - Script `test:int` = `vitest run -c vitest.integration.config.ts` (archivos `*.int.test.ts`, usa `DATABASE_URL_TEST`, `prisma migrate reset --force --skip-seed` en global setup).

- [ ] **Step 1:** Escribir `schema.prisma`; `pnpm prisma migrate dev --name init`. Crear migración vacía `--create-only --name audit_log_append_only` con función `audit_log_immutable()` que hace `RAISE EXCEPTION 'audit_log is append-only'` y trigger `BEFORE UPDATE OR DELETE ON "AuditLog"`. Aplicar.
- [ ] **Step 2: Tests que fallan** (`audit.int.test.ts`):
  - `writeAudit` dos veces → el segundo `prevHash` es el `hash` del primero; `verifyAuditChain()` → `{ ok: true }`.
  - `db.auditLog.update(...)` y `db.auditLog.delete(...)` rechazan con mensaje que contiene `append-only`.
  - 20 llamadas en paralelo (cada una en su `db.$transaction`) → 20 filas y `verifyAuditChain()` → `{ ok: true }`.
  - Alterar una fila con `SET session_replication_role = replica` (desactiva el trigger solo en el test) → `verifyAuditChain()` → `{ ok: false, brokenAt: <id> }`.
- [ ] **Step 3:** `pnpm test:int` → FAIL. Implementar `audit.ts`. → PASS.
- [ ] **Step 4:** Health: test unitario actualizado con `db` mockeado → `{ status: 'ok', db: 'up' }`.
- [ ] **Step 5: Commit** `feat(db): add full Prisma schema and append-only hash-chained audit log`

---

### Task 8: Autenticación, sesiones y guardas

**Modelo:** opus · **Files:**
- Create: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/rate-limit.ts`, `src/server/auth/guard.ts`, `src/server/auth/actions.ts`, `src/middleware.ts`
- Test: `src/server/auth/rate-limit.test.ts`, `src/server/auth/session.int.test.ts`, `src/server/auth/actions.int.test.ts`

**Interfaces:**
- Consumes: `db`, `writeAudit`, `assertRole`, `Role`, `env`.
- Produces:
```ts
hashPassword(plain: string): Promise<string>; verifyPassword(hash: string, plain: string): Promise<boolean>   // Argon2id
createSession(userId: string): Promise<{ token: string; expiresAt: Date }>  // guarda solo sha256(token)
validateSession(token: string): Promise<{ user: SessionUser; sessionId: string } | null>  // desliza expiración si quedan < 3,5 días
invalidateSession(sessionId: string): Promise<void>; invalidateUserSessions(userId: string): Promise<void>
type SessionUser = { id: string; email: string; name: string; role: Role; status: UserStatus }
createRateLimiter(o: { capacity: number; windowMs: number }): { take(key: string, now?: number): boolean }
getCurrentUser(): Promise<SessionUser | null>   // lee cookie 'ld_session'
requireUser(...roles: Role[]): Promise<SessionUser>  // sin sesión → redirect('/login'); status ≠ ENABLED → redirect('/onboarding'); rol no permitido → notFound()
homePathFor(role: Role): '/marketplace' | '/seller' | '/bo'
loginAction(prev: LoginState, form: FormData): Promise<LoginState>   // Zod {email, password}; error genérico 'Correo o contraseña incorrectos.'; limitador 5 intentos / 60 s por ip+email → 'Demasiados intentos. Intenta de nuevo en un minuto.'; audita LOGIN_SUCCEEDED / LOGIN_FAILED
logoutAction(): Promise<void>
```
- `middleware.ts`: si no hay cookie `ld_session` y la ruta empieza por `/marketplace`, `/saved`, `/processes`, `/alerts`, `/messages`, `/seller`, `/bo`, `/onboarding` → redirect `/login?next=…`. La validación real ocurre en `requireUser` (server).
- Cookie: `httpOnly`, `sameSite: 'lax'`, `secure` en producción, `path: '/'`.

- [ ] **Step 1: Tests que fallan:**
  - `rate-limit.test.ts`: 5 `take('k', t)` → `true`, el 6.º → `false`; en `t + 60_001` → `true`.
  - `session.int.test.ts`: `createSession` → la fila `Session` no contiene el token en ninguna columna y `tokenHash === sha256(token)`; `validateSession(token)` devuelve el usuario; token alterado → `null`; sesión expirada → `null`; tras `invalidateUserSessions` → `null`.
  - `actions.int.test.ts`: login correcto lanza el error `NEXT_REDIRECT` de Next cuyo `digest` contiene `homePathFor(role)` y escribe `LOGIN_SUCCEEDED`; contraseña mala → error genérico y `LOGIN_FAILED`; 6.º intento con la contraseña correcta → mensaje de demasiados intentos.
- [ ] **Step 2:** Ejecutar `pnpm test` y `pnpm test:int` → FAIL. Implementar. → PASS.
- [ ] **Step 3: Commit** `feat(auth): add argon2 sessions, rate-limited login and role guards`

---

### Task 9: Datos seed y `demo:reset`

**Modelo:** haiku (datos) → sonnet (script) · **Files:**
- Create: `prisma/seed/data/companies.ts`, `prisma/seed/data/users.ts`, `prisma/seed/index.ts`, `prisma/seed/teaser-art.ts`
- Modify: `package.json` (`prisma.seed`, `seed`, `demo:reset` = `prisma migrate reset --force` que ejecuta el seed)
- Test: `prisma/seed/seed.int.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `DEFAULT_SECTOR_MULTIPLES`, `DEFAULT_SCORE_WEIGHTS`, `Sector`, enums Prisma.
- Produces:
  - `type SeedCompany = { slug: string; name: string; legalName: string; nit: string; sector: Sector; subsector: string; department: string; city: string; foundedYear: number; employeesRange: string; description: string; opportunityType: 'VENTA_TOTAL' | 'VENTA_PARCIAL' | 'LEVANTAMIENTO_CAPITAL' | 'SOCIO_ESTRATEGICO'; status: OpportunityStatus; financials: { year: number; revenue: number; ebitda: number }[] /* millones COP, 2021–2025 */ }`
  - Cuentas demo (contraseña `LaDorada2026!` para todas): `comprador@demo.ladorada.co` (Luis Martínez, BUYER, ENABLED), `vendedor@demo.ladorada.co` (María González, SELLER, ENABLED, dueña de "Cafés de Antioquia S.A.S."), `admin@demo.ladorada.co` (Back Office, ENABLED); + 10 usuarios ficticios en estados PENDING / IN_REVIEW / CORRECTIONS_REQUESTED / REJECTED / BLOCKED.
  - 15 empresas en los 10 sectores y ≥ 6 departamentos: incluye "Cafés de Antioquia" (ALIMENTOS_BEBIDAS, Antioquia, VENTA_PARCIAL, ingresos 2025 12.000 M, EBITDA 2.100 M), "Logística Caribe" (Atlántico, VENTA_TOTAL, 25.000 / 4.500), "Tecnipagos Pyme" (Bogotá, LEVANTAMIENTO_CAPITAL, 8.000 / −200), "AgroAndina" (Valle del Cauca, SOCIO_ESTRATEGICO, 18.000 / 3.200). Estados: 11 `PUBLISHED`, 2 `IN_REVIEW`, 1 `DRAFT`, 1 `SUSPENDED`.
  - `Setting` con claves `sectorMultiples` y `scoreWeights`.
  - Imágenes de teaser: SVG generados por `teaser-art.ts` (`teaserSvg(sector: Sector, seed: number): string`), guardados como data URL en `Opportunity.teaserImage`.
- [ ] **Step 1 (haiku):** generar `companies.ts` y `users.ts` con el tipo exacto anterior, nombres y descripciones ficticias en es-CO.
- [ ] **Step 2: Test que falla** `seed.int.test.ts`: tras ejecutar el seed en la BD de prueba → 3 cuentas demo `ENABLED`; `opportunity.count({ where: { status: 'PUBLISHED' } }) === 11`; 15 empresas con 5 años de financieros cada una; `verifyAuditChain()` ok (el seed audita `SEED_LOADED`).
- [ ] **Step 3 (sonnet):** implementar `index.ts` idempotente. `pnpm test:int` → PASS. `pnpm demo:reset` contra la BD de desarrollo → sin errores.
- [ ] **Step 4: Commit** `feat(seed): add demo accounts and 15 fictional Colombian companies`

---

### Task 10: Sistema de diseño, shell por rol y login (E2E)

**Modelo:** sonnet (con skill `frontend-design`) · **Files:**
- Create: `docs/design-system.md`, `src/app/globals.css` (tokens), `src/components/ld/logo.tsx`, `src/components/ld/app-shell.tsx`, `src/components/ld/status-chip.tsx`, `src/components/ld/kpi-card.tsx`, `src/components/ld/disclaimer.tsx`, `src/components/ld/empty-state.tsx`, `src/config/nav.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(buyer)/layout.tsx`, `src/app/(buyer)/marketplace/page.tsx`, `src/app/(seller)/seller/layout.tsx`, `src/app/(seller)/seller/page.tsx`, `src/app/(backoffice)/bo/layout.tsx`, `src/app/(backoffice)/bo/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/page.tsx` (landing), `public/manifest.webmanifest`, `playwright.config.ts`
- Test: `e2e/auth/login-by-role.spec.ts`, `e2e/security/role-isolation.spec.ts`, `src/components/ld/status-chip.test.tsx`

**Interfaces:**
- Consumes: `requireUser`, `getCurrentUser`, `loginAction`, `logoutAction`, `homePathFor`, `VALUATION_DISCLAIMER`.
- Produces:
  - Tokens CSS (spec §8): `--ld-navy #0B2A6B`, `--ld-primary #1A5CE6`, `--ld-gold #F2B21B`, `--ld-bg #F5F8FF`, `--ld-surface #FFFFFF`, `--ld-border #E3E9F5`, `--ld-success #16A34A`, `--ld-warning #D97706`, `--ld-danger #DC2626`, `--ld-info #2563EB` (+ variantes `-soft` para fondos de chips), radios 12/16 px; fuentes Plus Jakarta Sans (títulos) e Inter (texto, `font-variant-numeric: tabular-nums` en cifras) vía `next/font`.
  - `type NavItem = { href: string; label: string; icon: LucideIcon }`; `NAV: Record<Role, NavItem[]>` con las listas de spec §8 (comprador 6, vendedor 7, Back Office 9 ítems).
  - `<AppShell role user>`: sidebar (logo, nav, tarjeta "Más empresas fuertes para un mejor Colombia.") + topbar (búsqueda, selector de región, ayuda, avatar con iniciales y rol, cerrar sesión); en < 768 px header con menú hamburguesa.
  - `<StatusChip tone="success|warning|danger|info|neutral">`, `<KpiCard value label delta?>`, `<Disclaimer>` (texto `VALUATION_DISCLAIMER`), `<EmptyState title description action?>`, `<Logo variant="full|mark">` (SVG propio: montañas doradas + wordmark navy + "EMPRESAS CON MÁS FUTURO").
  - Páginas de inicio por rol: marcador con título, saludo y `EmptyState` "Aquí verás… (disponible en M2/M3/M4)". Layouts llaman `requireUser('BUYER')`, `requireUser('SELLER')`, `requireUser('BACKOFFICE')`.
  - `/onboarding`: mensaje para usuarios no habilitados según su estado ("Tu registro está en revisión · 1 a 2 días hábiles", "Tenemos correcciones pendientes", "Tu cuenta está bloqueada…").
- [ ] **Step 1:** Cargar la skill `frontend-design` (si no está disponible, detenerse y pedir al usuario `/reload-plugins`). Escribir `docs/design-system.md` (tokens, tipografía, espaciado, componentes, estados vacíos/errores/skeletons, voz y microcopy es-CO, reglas de a11y) usando como referencia `docs/insumos/_img/slide02.png`, `slide03.png`, `slide13.png`.
- [ ] **Step 2: Tests que fallan:**
  - `status-chip.test.tsx`: `tone="warning"` renderiza clase de fondo `bg-[var(--ld-warning-soft)]` y el texto hijo.
  - `login-by-role.spec.ts`: para cada cuenta demo, iniciar sesión → URL termina en `homePathFor(role)` y el sidebar muestra el primer ítem de `NAV[role]`; contraseña mala → texto "Correo o contraseña incorrectos.".
  - `role-isolation.spec.ts`: comprador visita `/bo` y `/seller` → 404; sin sesión visita `/marketplace` → redirect a `/login`; usuario `IN_REVIEW` (seed) visita `/marketplace` → `/onboarding`; logout → visitar `/marketplace` redirige a `/login`.
- [ ] **Step 3:** `pnpm test` y `pnpm e2e` (Playwright con `webServer: pnpm dev`, requiere `docker compose up -d db` y `pnpm demo:reset`) → FAIL. Implementar. → PASS.
- [ ] **Step 4:** Verificación visual: capturas Playwright de `/login`, `/marketplace`, `/bo` a 1440 px y 390 px guardadas en `test-results/`; revisar contra el design system.
- [ ] **Step 5: Commit** `feat(ui): add design system, role shells and login`

---

### Task 11: Cierre de M1

**Modelo:** opus (revisión) · **Files:**
- Modify: `README.md` (arranque: `docker compose up -d`, `pnpm install`, `pnpm demo:reset`, `pnpm dev`; cuentas demo; integraciones simuladas), `docs/trazabilidad.md`

- [ ] **Step 1:** Ejecutar y mostrar salida: `pnpm lint && pnpm typecheck && pnpm test --coverage && pnpm test:int && pnpm build && pnpm e2e`. Esperado: todo verde; cobertura ≥ 80 % en `src/domain` y `src/server/auth`.
- [ ] **Step 2:** `superpowers:requesting-code-review` sobre la rama `m1-foundations`; aplicar hallazgos con `superpowers:receiving-code-review`.
- [ ] **Step 3:** `docker compose up --build` levanta `app` y `/api/health` responde `{ status: 'ok', db: 'up' }`.
- [ ] **Step 4: Commit** `docs: update README and traceability for M1`; luego `superpowers:finishing-a-development-branch` (merge local a `main`).

## Paralelización sugerida

Tras Task 1: **{Task 0, Task 2, Task 3}** en paralelo. Tras Task 3: **{Task 4, Task 6}** en paralelo; Task 5 después de 4. Task 7 después de 2+4+6. Task 8 después de 5+7. Task 9 después de 7+8 (el paso haiku de datos puede correr desde el inicio). Task 10 después de 8+9. Task 11 al final.
