# M2 Alta y validación (H6, H11) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un usuario nuevo (comprador o vendedor) se registra, completa un asistente de acreditación de 6 pasos con soportes, lo envía, y el Back Office lo revisa (identidad, representación, documentos, checklist KYC), pide correcciones, aprueba, rechaza o bloquea; el usuario habilitado entra a su panel.

**Architecture:** Sobre M1. Lógica pura en `src/domain/onboarding.ts`; mutaciones en `src/server/services/*` vía `audited()`; archivos en S3 (RustFS) mediante `src/server/storage`; notificaciones in-app + correo (Mailpit) vía `src/server/notify`. Páginas: `/registro`, `/onboarding` (asistente), `/bo/users`, `/bo/users/[id]`.

**Tech Stack:** Next.js 15 App Router, Prisma 6, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `nodemailer`, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-la-dorada-design.md` (§2 R6, §3.2–3.3, §4, §5 Usuario, §8, §9 H6/H11). Pendientes: `docs/plan/m1-pendientes.md` (P10, P11, P12, P15 se resuelven aquí).

## Global Constraints

- Todo lo de `docs/plan/01-m1-fundaciones.md` § Global Constraints sigue vigente (es-CO, Zod en bordes, enums idénticos, AuditLog en la misma transacción, scripts multiplataforma, sin push).
- **Toda mutación usa `audited()`** de `src/server/audit/audited.ts`; nuevas acciones se agregan a `AUDIT_ACTIONS`.
- **Route handlers / server actions** usan `requireActor(...)` + `errorResponse`/`toActionError` de `src/server/http/errors.ts`; páginas usan `requireUser(...)`.
- Transiciones de estado de usuario solo con `userMachine.transition` (`src/domain/machines/user.ts`).
- Archivos: solo PDF, JPEG, PNG; máx. 10 MB; tipo verificado por *magic bytes*, no por extensión; claves S3 `verification/<caseId>/<uuid>`; nunca URL pública; lectura solo con URL prefirmada de 60 s para el dueño o BACKOFFICE.
- Datos personales: consentimiento Habeas Data (Ley 1581/2012) obligatorio en registro, guardado en `User.consentAt`; texto marcado "validar con asesor legal". Nunca registrar números de documento ni contraseñas en AuditLog (solo ids y estados).
- Componentes visuales: seguir `docs/design-system.md` y la skill frontend-design (`C:/Users/judiv/.claude/plugins/cache/claude-plugins-official/frontend-design/41f619d61b99/skills/frontend-design/SKILL.md`).
- Resets de la BD de desarrollo los hace solo el controlador.

## Review Focus

1. **Subida maliciosa**: un `.exe` renombrado a `.pdf` o un archivo de 11 MB se rechaza con 422 y mensaje claro; nada queda en S3 ni en BD (test en Task 4).
2. **IDOR en documentos**: un usuario no puede leer ni borrar un documento de otro caso ni pedir su URL firmada; BACKOFFICE sí puede leer (test en Task 4).
3. **Reenvío incompleto**: enviar a revisión sin los soportes obligatorios devuelve la lista de faltantes y no cambia estados (test en Task 4).
4. **Doble decisión concurrente del Back Office**: aprobar y rechazar a la vez el mismo caso deja un solo resultado y una sola transición válida (la otra recibe 409) (test en Task 6).
5. **Usuario bloqueado con sesión activa**: al bloquear, sus sesiones se invalidan en la misma operación y su siguiente request va a `/login` (test en Task 6 y Task 8).

---

### Task 1: Adaptadores de almacenamiento y correo + notificaciones

**Modelo:** sonnet · **Files:**
- Create: `src/server/storage/index.ts`, `src/server/storage/s3.ts`, `src/server/storage/memory.ts`, `src/server/mail/index.ts`, `src/server/mail/smtp.ts`, `src/server/mail/memory.ts`, `src/server/notify/notify.ts`, `src/server/notify/templates.ts`
- Test: `src/server/storage/s3.int.test.ts`, `src/server/notify/notify.int.test.ts`, `src/server/mail/memory.test.ts`

**Interfaces:**
- Produces:
```ts
interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  presignGet(key: string, ttlSeconds?: number /* default 60 */): Promise<string>
  delete(key: string): Promise<void>
}
getStorage(): ObjectStorage            // s3 si env S3_*, memory en tests unitarios cuando STORAGE_DRIVER=memory
interface Mailer { send(m: { to: string; subject: string; text: string; html?: string }): Promise<void> }
getMailer(): Mailer                    // smtp (Mailpit) o memory (MAIL_DRIVER=memory)
notify(tx: Prisma.TransactionClient, n: { userId: string; kind: NotificationKind; payload: Record<string, unknown> }): Promise<void>  // crea Notification
type NotificationKind = 'ONBOARDING_SUBMITTED' | 'ONBOARDING_CORRECTIONS' | 'ONBOARDING_APPROVED' | 'ONBOARDING_REJECTED' | 'ACCOUNT_BLOCKED' | 'ACCOUNT_UNBLOCKED' | 'NEW_USER_TO_REVIEW'
sendTemplatedEmail(to: string, kind: NotificationKind, data: Record<string, string>): Promise<void>  // after commit, fallo se registra con console.error y no rompe la operación
```
- Env nuevos (agregar a `env.ts` y `.env.example`, con defaults): `STORAGE_DRIVER` (`s3`|`memory`, default `s3`), `MAIL_DRIVER` (`smtp`|`memory`, default `smtp`), `MAIL_FROM` (default `La Dorada <no-responder@ladorada.local>`). El cliente S3 usa `forcePathStyle: true`.
- Plantillas de correo en es-CO, texto plano + HTML simple, sin datos sensibles.

- [ ] **Step 1: Tests que fallan:** `s3.int.test.ts` (contra RustFS de Docker): `put` + `presignGet` → `fetch(url)` 200 con el mismo contenido; `fetch` sin firma a `${S3_ENDPOINT}/${bucket}/${key}` → 403; tras 61 s no es necesario probar expiración (usar `ttlSeconds: 1` y esperar 2 s → 403). `notify.int.test.ts`: `notify` dentro de `audited` crea la fila; si la transacción falla no queda fila. `memory.test.ts`: el mailer en memoria guarda los mensajes enviados.
- [ ] **Step 2:** Implementar. `pnpm test` y `pnpm test:int` → PASS. Esto resuelve P15 (si la URL prefirmada falla con RustFS, reportar BLOCKED con la evidencia).
- [ ] **Step 3: Commit** `feat(server): storage, mail and notification adapters`

---

### Task 2: Reglas de dominio del onboarding

**Modelo:** sonnet · **Files:**
- Create: `src/domain/onboarding.ts`
- Modify: `prisma/schema.prisma` (migración `onboarding_fields`)
- Test: `src/domain/onboarding.test.ts`

**Interfaces:**
- Migración: `VerificationCase` agrega `isLegalRepresentative Boolean?`, `buyerType BuyerType?`, `profile Json?` (datos de pasos 1, 3 y 4: teléfono, cargo, empresa/entidad, NIT, sector, ciudad), `submittedAt DateTime?`, `decidedAt DateTime?`, `decidedById String?`, `correctionNotes String?`, `rejectionReason String?`. `User` agrega `phone String?`.
- Produces:
```ts
type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6
const ONBOARDING_STEPS: Record<'BUYER' | 'SELLER', { step: OnboardingStep; title: string; description: string }[]>
// BUYER: 1 Tu perfil · 2 Verificación de identidad · 3 A quién representas · 4 Criterios de inversión · 5 Documentos de soporte · 6 Revisión y aprobación
// SELLER: 1 Tu perfil personal · 2 Verificación de identidad · 3 Representación legal · 4 Información de la empresa · 5 Documentos de soporte · 6 Revisión y aprobación
requiredDocuments(input: { role: 'BUYER' | 'SELLER'; isLegalRepresentative: boolean | null; buyerType: BuyerType | null }): VerificationDocumentType[]
// SELLER: NATIONAL_ID, CHAMBER_OF_COMMERCE, RUT, + POWER_OF_ATTORNEY si isLegalRepresentative === false
// BUYER: NATIONAL_ID; + CHAMBER_OF_COMMERCE y RUT si buyerType ∈ {FUND, STRATEGIC, FAMILY_OFFICE}; + RUT si ANGEL
type OnboardingSnapshot = { role; profile: Partial<ProfileData>; isLegalRepresentative; buyerType; hasPreferences: boolean; documents: { type: VerificationDocumentType; reviewStatus: ReviewStatus }[] }
onboardingProgress(s: OnboardingSnapshot): { completedSteps: OnboardingStep[]; missing: { step: OnboardingStep; reason: string }[]; canSubmit: boolean }
// `reason` en es-CO, p. ej. 'Falta el certificado de existencia y representación legal (Cámara de Comercio).'
const DOCUMENT_LABELS: Record<VerificationDocumentType, string>  // 'Cédula de ciudadanía', 'Certificado de Cámara de Comercio', 'RUT', 'Poder o autorización'
const DEFAULT_KYC_CHECKLIST: string[]  // ['Identidad verificada contra el documento', 'Representación legal verificada', 'Consulta en listas restrictivas (SARLAFT) sin coincidencias', 'Documentos legibles y vigentes']
const PROFILE_SCHEMAS  // Zod por paso: perfil (name, phone +57, position), entidad/empresa (legalName, nit `^\d{3}\.\d{3}\.\d{3}-\d$`, sector, department, city), preferencias (sectors[], regions[], ticketMin/Max en millones)
```
- [ ] **Step 1: Tests que fallan:** tabla de `requiredDocuments` (6 combinaciones); `onboardingProgress` con snapshot vacío → `canSubmit=false` y `missing` por cada paso; snapshot completo de vendedor representante legal → `canSubmit=true`; vendedor no representante sin poder → falta paso 5 con razón que menciona "Poder"; documento `REJECTED` cuenta como faltante; NIT inválido rechazado por el schema.
- [ ] **Step 2:** `pnpm prisma migrate dev --name onboarding_fields` (BD de desarrollo: migración aditiva, no reset). Implementar. PASS.
- [ ] **Step 3: Commit** `feat(domain): onboarding steps, required documents and progress`

---

### Task 3: Registro con consentimiento

**Modelo:** opus · **Files:**
- Create: `src/server/services/registration.ts`, `src/app/(auth)/registro/page.tsx`, `src/app/(auth)/registro/register-form.tsx`, `src/app/(auth)/registro/actions.ts`
- Modify: `src/server/audit/actions.ts` (+`USER_REGISTERED`), `src/app/(auth)/login/page.tsx` (enlace "Crear cuenta"), `src/app/page.tsx` (CTA de registro)
- Test: `src/server/services/registration.int.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `createSession`, `setSessionCookie`, `audited`, `getRequestContext`, `createRateLimiter`.
- Produces:
```ts
registerUser(input: { role: 'BUYER' | 'SELLER'; name: string; email: string; password: string; consent: true }, ctx: RequestContext): Promise<{ userId: string; token: string; expiresAt: Date }>
registerAction(prev: RegisterState, form: FormData): Promise<RegisterState>   // éxito → redirect('/onboarding')
```
- Reglas: email normalizado (trim + lowercase); contraseña 10–128 caracteres con al menos una letra y un número; `consent` debe ser `'on'` → `consentAt = now`; crea `User` (`status PENDING`) + `VerificationCase` (`OPEN`, step 1) + `KycChecklistItem` por cada `DEFAULT_KYC_CHECKLIST` + sesión, todo en un `audited()` con `USER_REGISTERED` (after: `{ role }`, sin email). Email duplicado → mensaje genérico `'No pudimos crear la cuenta con esos datos. Si ya tienes una, inicia sesión.'` (no revelar existencia) y no crear nada. Limitador: 5 registros / 15 min por IP.
- UI: elegir rol con dos opciones grandes ("Quiero invertir o comprar" / "Quiero vender o recibir inversión"), nombre, correo, contraseña con requisitos visibles, casilla de consentimiento con texto de tratamiento de datos (Ley 1581 de 2012, "validar con asesor legal") y enlace a una política resumida en un `<details>`.
- [ ] **Step 1: Tests que fallan:** registro válido crea usuario PENDING, caso OPEN con 4 ítems KYC, sesión, y una fila `USER_REGISTERED` sin el email; email existente → error genérico y conteo de usuarios igual; sin consentimiento → error de validación; contraseña débil → error; 6.º registro desde la misma IP → bloqueado.
- [ ] **Step 2:** Implementar. PASS en `test:int`, `test`, `build`.
- [ ] **Step 3: Commit** `feat(onboarding): sign-up with Habeas Data consent`

---

### Task 4: Servicio de onboarding (pasos, documentos, envío)

**Modelo:** opus · **Files:**
- Create: `src/server/services/onboarding.ts`, `src/app/api/verification/documents/route.ts` (POST subir), `src/app/api/verification/documents/[id]/route.ts` (GET → 302 a URL firmada; DELETE), `src/server/files/sniff.ts`
- Modify: `src/server/audit/actions.ts` (+`ONBOARDING_STEP_SAVED`, `VERIFICATION_DOCUMENT_UPLOADED`, `VERIFICATION_DOCUMENT_DELETED`, `VERIFICATION_DOCUMENT_VIEWED`, `ONBOARDING_SUBMITTED`)
- Test: `src/server/services/onboarding.int.test.ts`, `src/server/files/sniff.test.ts`, `src/app/api/verification/documents/route.int.test.ts`

**Interfaces:**
- Produces:
```ts
getOnboardingState(userId: string): Promise<OnboardingView>   // caso abierto más reciente + snapshot + progreso + notas de corrección
saveStep(userId: string, step: 1|3|4, data: unknown): Promise<void>  // valida con PROFILE_SCHEMAS; paso 4 comprador → upsert BuyerPreferences; solo si status ∈ {PENDING, CORRECTIONS_REQUESTED}
uploadVerificationDocument(userId: string, type: VerificationDocumentType, file: { name: string; bytes: Buffer }): Promise<{ id: string }>
deleteVerificationDocument(userId: string, documentId: string): Promise<void>
documentReadUrl(actor: SessionUser, documentId: string): Promise<string>  // dueño o BACKOFFICE; audita VERIFICATION_DOCUMENT_VIEWED
submitForReview(userId: string): Promise<void>
sniffMime(bytes: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null
```
- `submitForReview`: si `!canSubmit` → `ValidationError` con la lista de faltantes; si status `PENDING` → evento `SUBMIT`, si `CORRECTIONS_REQUESTED` → `RESUBMIT` (vía `userMachine`); caso → `IN_REVIEW`, `submittedAt`; `notify` al usuario (`ONBOARDING_SUBMITTED`) y a cada BACKOFFICE habilitado (`NEW_USER_TO_REVIEW`); correos después del commit.
- Subir: un documento por tipo (reemplaza el anterior del mismo tipo, borrando el objeto S3 después del commit); `multipart/form-data` con campos `type` y `file`; límite 10 MB verificado antes de leer todo el cuerpo cuando `content-length` lo indique y de nuevo sobre los bytes; nombre original solo en `profile`, la clave S3 es aleatoria.
- Route handlers usan `requireActor('BUYER','SELLER')` salvo GET (también `BACKOFFICE`); usuarios cuyo estado no sea `PENDING` o `CORRECTIONS_REQUESTED` no pueden subir/borrar (403).
- [ ] **Step 1: Tests que fallan:** `sniff.test.ts` (PDF, JPEG, PNG reales por cabecera; texto y ejecutable `MZ` → null). Integración: subir PDF válido crea fila + objeto; `.exe` con nombre `.pdf` → 422 y nada creado; 11 MB → 422; usuario A no puede `GET`/`DELETE` documento de B (403) y BACKOFFICE sí obtiene URL; `submitForReview` incompleto → `ValidationError` con faltantes y estados intactos; completo → user `IN_REVIEW`, caso `IN_REVIEW`, notificaciones a usuario y BO, auditoría; tras `IN_REVIEW` `saveStep` y subir → 403/409.
- [ ] **Step 2:** Implementar con `audited()`. PASS.
- [ ] **Step 3: Commit** `feat(onboarding): steps, verified uploads and submission`

---

### Task 5: Asistente de acreditación (UI)

**Modelo:** sonnet (frontend-design) · **Files:**
- Modify: `src/app/onboarding/page.tsx`
- Create: `src/app/onboarding/actions.ts`, `src/app/onboarding/_components/*` (stepper, paso 1/3/4 formularios, subida de documentos con estado, resumen de envío, vista "en revisión", vista de correcciones con notas, vista rechazado/bloqueado)

**Interfaces:** Consumes `getOnboardingState`, `saveStep`, `submitForReview`, rutas de documentos; `ONBOARDING_STEPS`, `DOCUMENT_LABELS`.
- Comportamiento: stepper de 6 pasos (horizontal en escritorio, vertical en móvil, como el pitch slide 7) con progreso visible y "qué falta y por qué" (de `missing`); guardar por paso con confirmación; subida con barra/estado y validación previa en cliente (tipo, 10 MB) más la del servidor; paso 6 resume y envía; tras enviar muestra "En revisión · 1 a 2 días hábiles"; en `CORRECTIONS_REQUESTED` muestra las notas del Back Office arriba y permite editar; `REJECTED` y `BLOCKED` muestran mensaje y contacto, sin formularios. Paso 2 "Verificación de identidad" = subir cédula.
- [ ] **Step 1:** Implementar siguiendo la skill frontend-design y `docs/design-system.md`.
- [ ] **Step 2:** Capturas 1440 y 390 de cada estado; revisar y ajustar una vez.
- [ ] **Step 3:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. **Commit** `feat(onboarding): accreditation wizard`

---

### Task 6: Servicio de validación del Back Office

**Modelo:** opus · **Files:**
- Create: `src/server/services/user-review.ts`, `src/server/kyc/index.ts`, `src/server/kyc/mock.ts`
- Modify: `src/server/audit/actions.ts` (+`USER_APPROVED`, `USER_REJECTED`, `USER_CORRECTIONS_REQUESTED`, `USER_BLOCKED`, `USER_UNBLOCKED`, `KYC_ITEM_CHECKED`, `KYC_SCREENING_RUN`, `VERIFICATION_DOCUMENT_REVIEWED`), `src/server/auth/actions.ts` (logout auditado `LOGOUT` — P10)
- Test: `src/server/services/user-review.int.test.ts`

**Interfaces:**
- Produces:
```ts
listUsersForReview(filter: { role?: 'BUYER' | 'SELLER'; status?: UserStatus; q?: string; page?: number }): Promise<{ items: UserReviewRow[]; total: number }>
// UserReviewRow: id, name, email, role, status, organizationName, docs: { delivered: number; required: number }, updatedAt
getUserReview(userId: string): Promise<UserReviewDetail>   // perfil, caso, documentos (sin URL), checklist, historial de auditoría del usuario
reviewDocument(actor: SessionUser, documentId: string, status: 'APPROVED' | 'REJECTED'): Promise<void>
toggleKycItem(actor: SessionUser, itemId: string, done: boolean): Promise<void>
runKycScreening(actor: SessionUser, userId: string): Promise<KycScreeningResult>  // adaptador mock: { matches: [], provider: 'mock', checkedAt }; marca el ítem de listas restrictivas
decideUser(actor: SessionUser, userId: string, decision: { kind: 'APPROVE' } | { kind: 'REQUEST_CORRECTIONS'; notes: string } | { kind: 'REJECT'; reason: string }): Promise<void>
blockUser(actor: SessionUser, userId: string, reason: string): Promise<void>
unblockUser(actor: SessionUser, userId: string): Promise<void>
```
- Reglas: todo exige `actor.role === 'BACKOFFICE'` (`assertRole`); un Back Office no se decide a sí mismo; `APPROVE` exige todos los ítems KYC `done` y todos los documentos requeridos `APPROVED` (si no → `ValidationError` con lo que falta); notas/razón 10–1000 caracteres; transición con `userMachine` + caso (`APPROVED`/`CORRECTIONS_REQUESTED`/`REJECTED`, `decidedAt`, `decidedById`); concurrencia: `SELECT ... FOR UPDATE` del usuario dentro de la transacción antes de transicionar, para que la segunda decisión vea el estado nuevo y reciba `InvalidTransitionError`; `blockUser` llama `invalidateUserSessions` dentro de la misma transacción (vía `tx`); notificaciones + correo al usuario.
- [ ] **Step 1: Tests que fallan:** aprobar sin KYC completo → `ValidationError`; flujo completo IN_REVIEW → aprobar → `ENABLED` con auditoría y notificación; pedir correcciones guarda notas y usuario `CORRECTIONS_REQUESTED`; rechazar; bloquear invalida sesiones (`validateSession` → null); desbloquear; actor `SELLER` → `ForbiddenError`; dos `decideUser` concurrentes (APPROVE y REJECT) → exactamente uno gana y el otro lanza `InvalidTransitionError`; logout escribe `LOGOUT`.
- [ ] **Step 2:** Implementar. PASS.
- [ ] **Step 3: Commit** `feat(backoffice): user review service with KYC checklist`

---

### Task 7: Pantallas de validación del Back Office

**Modelo:** sonnet (frontend-design) · **Files:**
- Create: `src/app/(backoffice)/bo/users/page.tsx`, `src/app/(backoffice)/bo/users/[id]/page.tsx`, `src/app/(backoffice)/bo/users/actions.ts`, `src/app/(backoffice)/bo/users/_components/*`
- Modify: `src/app/(backoffice)/bo/page.tsx` (KPIs reales: usuarios por estado, pendientes de revisión), `src/config/nav.ts` / `app-shell.tsx` (ítems sin pantalla aún → `aria-disabled` + "Pronto", P12)

**Interfaces:** Consumes Task 6.
- `/bo/users`: pestañas Todos / Compradores / Vendedores con conteos, búsqueda, filtro por estado, tabla (pitch slide 12): usuario, empresa, tipo, documentos `n/m`, estado (StatusChip), última actualización, acción ("Revisar" / "Ver detalles"); paginación; móvil como lista de tarjetas.
- `/bo/users/[id]`: datos del perfil, documentos con botón "Ver" (abre la URL firmada en pestaña nueva) y aprobar/rechazar por documento, checklist KYC con casillas y botón "Consultar listas restrictivas" (mock, con aviso "Simulado"), historial, y acciones Aprobar / Solicitar correcciones (diálogo con notas) / Rechazar (diálogo con razón) / Bloquear / Desbloquear. El botón Aprobar muestra qué falta cuando está deshabilitado. Errores de servicio con `toActionError`.
- [ ] **Step 1:** Implementar siguiendo frontend-design.
- [ ] **Step 2:** Capturas 1440/390; revisar y ajustar.
- [ ] **Step 3:** Verificación estándar. **Commit** `feat(backoffice): user validation screens`

---

### Task 8: E2E H06 y H11

**Modelo:** sonnet · **Files:**
- Create: `e2e/H06-registro-vendedor.spec.ts`, `e2e/H11-validacion-usuarios.spec.ts`, `e2e/fixtures/` (PDF y PNG mínimos válidos, un `.exe` falso)
- Modify: `e2e/helpers.ts`

- [ ] **Step 1:** H06: un vendedor nuevo (email único por corrida, p. ej. `vendedor+<timestamp>@demo.ladorada.co`) se registra con consentimiento → completa los 6 pasos subiendo cédula, cámara de comercio y RUT → envía → ve "En revisión". H11: admin entra a `/bo/users`, encuentra al usuario, abre un documento, aprueba documentos, marca KYC, solicita correcciones → el vendedor ve las notas, reenvía → admin aprueba → el vendedor entra y llega a `/seller`. Seguridad: subir el `.exe` falso muestra el error; el admin bloquea al usuario y su sesión abierta termina en `/login` al recargar.
- [ ] **Step 2:** `pnpm e2e` verde (respetar el limitador).
- [ ] **Step 3: Commit** `test(e2e): H06 sign-up and H11 user validation`

---

### Task 9: Cierre de M2

**Modelo:** controlador (verificación) + sonnet (docs) · **Files:** `README.md`, `docs/trazabilidad.md`, `docs/plan/m1-pendientes.md`

- [ ] **Step 1:** Actualizar README (registro, flujo de validación, Mailpit en :8025 para ver correos) y trazabilidad (H6, H11 → rutas, servicios, E2E); marcar P10, P11 (si se hizo), P12, P15 resueltos.
- [ ] **Step 2:** Verificación completa y revisión final de rama (opus); merge local a `main`.
