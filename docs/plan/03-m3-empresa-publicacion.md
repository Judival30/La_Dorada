# M3 Empresa y publicación (H7, H8, H9, H12) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un vendedor habilitado registra la información de su empresa (general, financiera, operativa, soportes, imagen), define la oportunidad (modalidad, objetivo, tamaño, horizonte, perfil ideal), decide qué es público (teaser) y qué es confidencial (data room) y la envía a revisión; el Back Office la evalúa (valoración por múltiplos, calidad de información, matriz de riesgos, score) y la aprueba y publica, pide ajustes o la rechaza. **Ninguna oportunidad se publica sin pasar por el Back Office (R1).**

**Architecture:** Igual que M2: dominio puro en `src/domain/{company,opportunity,visibility,evaluation}.ts`; servicios con `audited()`, bloqueo `FOR UPDATE` y máquinas de estado; archivos vía `src/server/storage`; UI con la skill frontend-design. El teaser público se produce SOLO con `toTeaser()` (serializador puro, R2(b) y anonimato).

**Tech Stack:** el de M1–M2.

**Spec:** `docs/superpowers/specs/2026-10-26-la-dorada-design.md` (§2 R1–R3, §4, §5 Oportunidad, §7, §8, §9 H7–H9, H12). Pendientes: `docs/plan/m1-pendientes.md` (se resuelven aquí P3, P5, M2-4, M2-9, M2-10, M2-11, M2-12, M2-13 parcial, M2-16).

## Global Constraints

- Todo lo de M1/M2 sigue vigente (es-CO, Zod en bordes, enums idénticos dominio↔Prisma, `audited()` en toda mutación con acciones en `AUDIT_ACTIONS`, sin PII en AuditLog, `requireActor`/`requireUser`, resets de BD solo por el controlador, sin push).
- Transiciones de oportunidad solo con `opportunityMachine` (`src/domain/machines/opportunity.ts`); el vendedor nunca puede llegar a `PUBLISHED` (R1, test explícito).
- Montos en BD como `BigInt` en pesos; formularios en **millones de COP** (enteros), convertidos con `millions()`; mostrar con `formatCOP`.
- La valoración y el score se calculan SOLO con `valuationRange` / `computeScore` de `src/domain/valuation.ts`, con múltiplos y pesos leídos de `Setting` (`sectorMultiples`, `scoreWeights`); siempre acompañados de `VALUATION_DISCLAIMER` (R3).
- El teaser nunca muestra: razón social, NIT, ciudad, dirección, nombres de clientes/proveedores ni cifras exactas; solo nombre clave (`Opportunity.title`), sector, departamento, modalidad, rangos y las secciones con `inTeaser = true`.
- Archivos del data room: PDF/JPEG/PNG/XLSX/DOCX/PPTX (sniff por *magic bytes*; los formatos Office son ZIP — validar la entrada `[Content_Types].xml`), ≤ 20 MB, claves `dataroom/<opportunityId>/<uuid>`, nunca públicos. Imagen de teaser: JPEG/PNG ≤ 5 MB, clave `teaser/<opportunityId>/<uuid>`.
- Visual: `docs/design-system.md` + skill frontend-design (`C:/Users/judiv/.claude/plugins/cache/claude-plugins-official/frontend-design/41f619d61b99/skills/frontend-design/SKILL.md`); referencias del pitch: `docs/insumos/_img/slide08.png` (H7), `slide09.png` (H8), `slide10.png` (H9), `slide13.png` (H12).

## Review Focus

1. **Publicación directa**: un vendedor que llame a la acción de transición con `APPROVE_AND_PUBLISH` o edite el estado recibe 403 y la oportunidad no cambia (Task 4).
2. **Fuga en el teaser**: secciones con `inTeaser=false`, razón social, NIT y ciudad nunca aparecen en la salida de `toTeaser` ni en la vista previa (Task 2, Task 5).
3. **Edición tras envío**: con la oportunidad `IN_REVIEW` o `PUBLISHED`, el vendedor no puede cambiar empresa, financieros, visibilidad ni documentos (409) salvo en `ADJUSTMENTS_REQUESTED`/`DRAFT` (Task 3, 4).
4. **NIT duplicado**: dos vendedores con el mismo NIT → el segundo recibe un error claro y no se crea una segunda organización (Task 3).
5. **Valoración sin datos**: empresa sin estados financieros completos no puede enviarse; el Back Office ve "Faltan estados financieros" en vez de un rango de COP 0 (Task 2, 6).

---

### Task 1: Arrastre de M2 (decisiones durables, conteos, FK)

**Modelo:** sonnet · **Files:** `prisma/schema.prisma` (migración `review_decisions`), `src/server/services/user-review.ts`, `src/server/services/review-decisions.ts`, `src/app/(backoffice)/bo/page.tsx`, `src/app/(backoffice)/bo/users/page.tsx`, `prisma/seed/index.ts`, tests.

**Interfaces:**
```prisma
enum ReviewSubject { USER OPPORTUNITY }
enum ReviewDecisionKind { APPROVE REQUEST_CORRECTIONS REJECT BLOCK UNBLOCK SUSPEND REINSTATE }
model ReviewDecision { id String @id @default(cuid()); subjectType ReviewSubject; subjectId String; kind ReviewDecisionKind; text String?; actorId String; actor User @relation("ReviewDecisionActor", fields:[actorId], references:[id], onDelete: Restrict); createdAt DateTime @default(now()); @@index([subjectType, subjectId, createdAt]) }
```
- `VerificationCase.decidedById` pasa a relación real con `User` (`onDelete: Restrict`).
- `recordDecision(tx, { subjectType, subjectId, kind, text?, actorId })` en `review-decisions.ts`; `decideUser`/`blockUser`/`unblockUser` lo llaman en su transacción. `getUserReview` devuelve `decisions: { at, kind, text, actorName }[]` y la pantalla `/bo/users/[id]` muestra el historial de decisiones con su texto (React text).
- `countUsersForReview(actor): Promise<Record<'BUYER'|'SELLER', Partial<Record<UserStatus, number>>>>` (una consulta `groupBy`); `/bo` y las pestañas de `/bo/users` lo usan (M2-4/M2-10).
- Seed: usar el caso más reciente (`createdAt desc`) igual que la app (M2-12). Excluir `LOGOUT` de la rama de entidad del historial (M2 parked).
- [ ] Tests (int): cada decisión crea una fila con texto; segunda ronda de correcciones conserva ambas; `countUsersForReview` coincide con conteos reales; FK rechaza `decidedById` inexistente.
- [ ] Commit `feat(backoffice): durable review decisions and count helper`

---

### Task 2: Dominio de empresa, oportunidad, visibilidad y evaluación

**Modelo:** opus · **Files:** `src/domain/company.ts`, `src/domain/opportunity.ts`, `src/domain/visibility.ts`, `src/domain/evaluation.ts`, `src/domain/files.ts` (si se mueve el sniff extendido), tests de cada uno; `prisma/schema.prisma` (migración `evaluation_single_source`).

**Interfaces:**
```ts
// company.ts
nitCheckDigit(base9: string): number            // algoritmo DIAN (pesos 41,37,29,23,19,17,13,7,3 sobre los dígitos de derecha a izquierda; dv = r<2 ? r : 11-r)
isValidNit(nit: string): boolean                // formato `^\d{3}\.\d{3}\.\d{3}-\d$` + dígito verificador
COMPANY_SCHEMAS: { general, sector, operations, location }   // Zod, campos de slide08: nombre comercial, descripción (40–600), año de fundación (1900–año actual), tamaño (rangos de empleados), sector (Sector), subsector, etiquetas (≤5), canales, capacidad, departamento (DEPARTMENTS), ciudad, dirección opcional (solo data room)
FINANCIAL_YEARS_SCHEMA  // 3 a 5 años consecutivos que terminen en el año anterior al actual o el actual; revenue/ebitda/netIncome en millones (enteros; ebitda y netIncome pueden ser negativos; revenue ≥ 0)
// opportunity.ts
OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, { label: string; description: string }>  // 'Venta total — Vendo el 100% de la empresa.' etc. (slide09)
OBJECTIVES (lista es-CO), HORIZONS ('Menos de 6 meses' | '6 a 12 meses' | '12 a 24 meses' | 'Más de 24 meses'), DEAL_SIZE_RANGES (millones COP: 0–5.000, 5.000–20.000, 20.000–50.000, 50.000+)
OPPORTUNITY_SCHEMA  // type, objective, dealSizeRange, horizon, idealBuyerProfile (20–500), title (nombre clave 3–60, sin dígitos de NIT)
generateCodename(seed: string): string          // 'Proyecto <palabra>' determinista desde una lista de 40 palabras (cóndor, ceiba, guadua…)
opportunityReadiness(s: OpportunitySnapshot): { complete: boolean; missing: { area: 'company'|'financials'|'documents'|'opportunity'|'visibility'|'teaser'; reason: string }[] }
// visibility.ts
INFO_SECTION_META: Record<InfoSection, { label: string; description: string; teaserAllowed: boolean; defaultTeaser: boolean }>  // slide10; FINANCIAL_STATEMENTS, CONTRACTS, CAPEX, LITIGATION, SHAREHOLDERS, PROJECTIONS: teaserAllowed=false
defaultVisibility(): { section; inTeaser; inDataRoom }[]
type Teaser = { id; title; type; typeLabel; sector; sectorLabel; department; teaserImageUrl: string | null; sections: Partial<Record<'SUMMARY'|'BUSINESS'|'REVENUE'|'OPERATIONS', TeaserSection>>; evaluation: { valuationLow; valuationHigh; score; disclaimer } | null }
toTeaser(input: TeaserSource): Teaser           // puro; REVENUE muestra rango (bucket) del último año y crecimiento %, nunca cifra exacta; nunca legalName/nit/city/address; secciones con inTeaser=false ausentes
// evaluation.ts
EVALUATION_ITEM_META, DATA_ROOM_FOLDERS (8 carpetas estándar: 'Estados financieros', 'Declaraciones tributarias', 'Contratos', 'Clientes', 'Proveedores', 'Capex y activos fijos', 'Litigios y contingencias', 'Permisos y cumplimiento'; `required: true` para las 6 primeras)
toScoreInput(e: { items: { kind; status }[]; foldersDelivered: number; foldersRequired: number; financials: {year;revenue;ebitda}[] }): ScoreInput   // P3: única fuente = EvaluationItem
opportunityApprovalBlockers(e): string[]        // es-CO; vacío = se puede aprobar
```
- Migración `evaluation_single_source`: eliminar `Evaluation.financialConsistency/customerDependency/legalContingencies`; agregar `HIGH_RISK` a `EvaluationItemStatus`; `DataRoomFolder.required Boolean @default(false)`; `Opportunity.teaserImageKey String?` (la imagen deja de ser data URL; `teaserImage` queda para el seed SVG y se elimina en Task 8). Mapeo P3: estados → `MatrixStatus`: APPROVED/COMPLETED→APPROVED, TO_CLARIFY→TO_CLARIFY, MEDIUM_RISK/HIGH_RISK→RISK; → `RiskLevel`: APPROVED/COMPLETED→LOW, MEDIUM_RISK→MEDIUM, HIGH_RISK→HIGH, TO_CLARIFY→TO_CLARIFY.
- [ ] Tests: NIT válidos/inválidos (incluye `900.123.456-?` calculado), años no consecutivos rechazados, `toTeaser` no contiene legalName/NIT/ciudad (búsqueda en `JSON.stringify`), secciones ocultas ausentes, REVENUE en rango; `toScoreInput` + `computeScore` reproduce 78 con el ejemplo de M1; readiness vacío lista cada área.
- [ ] Commit `feat(domain): company, opportunity, teaser and evaluation rules`

---

### Task 3: Servicio de empresa y documentos del vendedor (H7)

**Modelo:** opus · **Files:** `src/server/services/company.ts`, `src/server/files/` (generalizar sniff/límites), `src/app/api/opportunities/[id]/documents/route.ts` (POST), `src/app/api/documents/[id]/route.ts` (GET 302 firmada / DELETE), `src/app/api/opportunities/[id]/teaser-image/route.ts` (POST, GET), tests.

**Interfaces:**
```ts
getSellerWorkspace(actor): Promise<SellerWorkspace>  // empresa (o null + prefill desde VerificationCase.profile.step4), oportunidades del vendedor con estado
ensureSellerCompany(actor): Promise<{ companyId; opportunityId }>  // crea Organization(COMPANY, nit) + Company + Opportunity(DRAFT, title=generateCodename, carpetas DATA_ROOM_FOLDERS, defaultVisibility) desde step4; NIT ya existente en otra organización → ValidationError('Ya hay una empresa registrada con ese NIT. Escríbenos a soporte@ladorada.co para revisarlo.'); vincula User.organizationId
saveCompanySection(actor, opportunityId, section: 'general'|'sector'|'operations'|'location', data)
saveFinancials(actor, opportunityId, years)
uploadDataRoomDocument(actor, opportunityId, folderId, file)   // reutiliza pipeline M2 (cap, sniff, limiter por usuario, reemplazo no aplica: varios por carpeta)
deleteDataRoomDocument(actor, documentId)
uploadTeaserImage(actor, opportunityId, file) / teaserImageUrl(actor, opportunityId)
```
- Autorización: `requireActor('SELLER')`; el vendedor solo opera sobre oportunidades con `sellerId = actor.id`; ajenas → 404. Ediciones solo con oportunidad `DRAFT` o `ADJUSTMENTS_REQUESTED` (si no, `InvalidTransitionError` 409), verificadas bajo `SELECT … FOR UPDATE` de la oportunidad.
- GET de documento del data room en M3: dueño o BACKOFFICE habilitado (los compradores llegan en M4 con `canAccessConfidential`); misma política de cabeceras de M2.
- Imagen de teaser GET: dueño, BACKOFFICE, o cualquier usuario ENABLED si la oportunidad está `PUBLISHED` (no es confidencial).
- Auditoría: `COMPANY_UPDATED`, `FINANCIALS_UPDATED`, `DATAROOM_DOCUMENT_UPLOADED/DELETED/VIEWED`, `TEASER_IMAGE_UPLOADED` (solo ids).
- [ ] Tests (int): crear empresa desde step4; NIT duplicado; IDOR 404; edición bloqueada en IN_REVIEW (409); XLSX real aceptado y ZIP no-Office rechazado; imagen visible para comprador solo si PUBLISHED.
- [ ] Commit `feat(seller): company workspace, financials and data room uploads`

---

### Task 4: Servicio de oportunidad, visibilidad y envío (H8, H9)

**Modelo:** opus · **Files:** `src/server/services/opportunity.ts`, tests.
```ts
saveOpportunityDefinition(actor, opportunityId, data)  // OPPORTUNITY_SCHEMA; dealSize en BigInt
saveVisibility(actor, opportunityId, rows: { section; inTeaser; inDataRoom }[])  // rechaza inTeaser=true en secciones !teaserAllowed; inDataRoom=false + inTeaser=false = sección no compartida
getTeaserPreview(actor, opportunityId): Promise<Teaser>  // usa toTeaser con evaluation=null
submitOpportunity(actor, opportunityId)      // readiness completo; SUBMIT o RESUBMIT; notify BACKOFFICE (OPPORTUNITY_TO_REVIEW, payload {opportunityId}); audita OPPORTUNITY_SUBMITTED
withdrawOpportunity(actor, opportunityId)    // PUBLISHED → WITHDRAWN_BY_SELLER
```
- Nuevos `NotificationKind`: `OPPORTUNITY_TO_REVIEW`, `OPPORTUNITY_ADJUSTMENTS`, `OPPORTUNITY_PUBLISHED`, `OPPORTUNITY_REJECTED`, `OPPORTUNITY_SUSPENDED` (+ plantillas es-CO sin datos sensibles).
- [ ] Tests (int): vendedor no puede publicar (llamar `opportunityMachine` vía cualquier acción expuesta con evento `APPROVE_AND_PUBLISH` → 403 y estado intacto); enviar incompleto → `ValidationError` con faltantes; secciones confidenciales no pueden ir al teaser; concurrencia submit doble.
- [ ] Commit `feat(seller): opportunity definition, visibility and submission`

---

### Task 5: Pantallas del vendedor (H7, H8, H9)

**Modelo:** sonnet (frontend-design) · **Files:** `src/app/(seller)/seller/**`, `src/config/nav.ts` (activar ítems del vendedor).
- `/seller`: resumen con las oportunidades del vendedor (tarjetas con nombre clave, modalidad, estado StatusChip, qué falta, CTA), y si no tiene empresa, CTA "Registrar mi empresa" (crea con `ensureSellerCompany`).
- `/seller/opportunities/[id]/company` (slide08): secciones General, Sector, Financiera (tabla de 3–5 años en millones), Operativa, Ubicación, Documentos de soporte por carpeta, Imagen del teaser; "Borrador guardado".
- `/seller/opportunities/[id]/definition` (slide09): tarjetas de modalidad, objetivo, tamaño, horizonte, perfil ideal, nombre clave.
- `/seller/opportunities/[id]/visibility` (slide10): tabla de secciones con interruptores Teaser / Data room (deshabilitados donde no aplica, con explicación), panel "Información pública vs. confidencial", **vista previa del teaser** renderizada desde `getTeaserPreview`.
- `/seller/opportunities/[id]/review`: lista de faltantes (`opportunityReadiness`), botón "Enviar a revisión" / "Reenviar a revisión", estado y notas de ajustes del Back Office (último `ReviewDecision`).
- [ ] Capturas 1440/390 y una iteración de crítica. Verificación estándar. Commit `feat(seller): company, opportunity and visibility screens`

---

### Task 6: Servicio de evaluación del Back Office (H12)

**Modelo:** opus · **Files:** `src/server/services/opportunity-review.ts`, tests.
```ts
countOpportunitiesForReview(actor)            // groupBy status
listOpportunitiesForReview(actor, filter)     // IN_REVIEW primero (FIFO por fecha de envío), luego ADJUSTMENTS_REQUESTED, PUBLISHED, SUSPENDED, …
getOpportunityEvaluation(actor, opportunityId)  // empresa completa (razón social, NIT: BO sí los ve), financieros, carpetas con conteo, teaser preview, evaluación calculada: valuationRange con Setting.sectorMultiples (o "Faltan estados financieros"), calidad de información (carpetas requeridas con ≥1 documento), matriz (4 ítems; DOCUMENTARY calculado = COMPLETED si todas las carpetas requeridas tienen documentos), score (toScoreInput+computeScore con Setting.scoreWeights), breakdown, historial de decisiones
setEvaluationItem(actor, opportunityId, kind: Exclude<EvaluationItemKind,'DOCUMENTARY'>, status, notes?)   // crea/actualiza Evaluation y recalcula y persiste valuationLow/High, score, breakdown, docsDelivered/Required
decideOpportunity(actor, opportunityId, { kind: 'APPROVE_AND_PUBLISH' } | { kind: 'REQUEST_ADJUSTMENTS'; notes } | { kind: 'REJECT'; reason })
suspendOpportunity(actor, opportunityId, reason) / reinstateOpportunity(actor, opportunityId)
```
- Reglas: `assertRole(actor,'BACKOFFICE')`; lock de la oportunidad; APPROVE exige `opportunityApprovalBlockers(...)` vacío (todos los ítems evaluados, ninguno `TO_CLARIFY`, financieros válidos, evaluación persistida reciente); publica con `publishedAt = now`; `ReviewDecision` con texto; notifica al vendedor + correo tras commit; auditoría con ids y estados.
- [ ] Tests (int): aprobar con ítems pendientes → `ValidationError`; flujo IN_REVIEW → ajustes → reenvío → aprobar → PUBLISHED; concurrencia (dos decisiones → una gana); SELLER → 403; valoración coincide con `valuationRange` para Cafés de Antioquia (13.900–20.800 M) cuando los financieros sembrados lo permiten.
- [ ] Commit `feat(backoffice): opportunity evaluation and publication`

---

### Task 7: Pantallas de evaluación del Back Office (H12)

**Modelo:** sonnet (frontend-design) · **Files:** `src/app/(backoffice)/bo/companies/**` (cola + `/[id]/evaluation`), `src/app/(backoffice)/bo/page.tsx` (KPIs de oportunidades), `src/config/nav.ts` (activar "Empresas" y "Oportunidades").
- Cola: pestañas por estado con conteos, tabla/tarjetas con nombre clave + razón social (solo BO), sector, modalidad, fecha de envío, estado.
- Evaluación (slide13): encabezado con empresa y estado; "Resultado de valoración" (rango estimado de referencia + `Disclaimer`), "Calidad de información" con barra y `n/m carpetas`, "Matriz de evaluación" (4 filas con selector de estado y notas; Documental calculado), score con desglose, vista previa del teaser tal como lo verá el comprador, historial; acciones Solicitar ajustes / Rechazar / Aprobar y publicar (este último deshabilitado con la lista de bloqueos), Suspender / Reactivar si está publicada.
- [ ] Capturas e iteración; verificación estándar. Commit `feat(backoffice): opportunity evaluation screens`

---

### Task 8: Seed de oportunidades evaluadas

**Modelo:** sonnet · **Files:** `prisma/seed/**`.
- Para las 15 empresas: carpetas `DATA_ROOM_FOLDERS` (con `required`), documentos ficticios en S3 (reutilizar fixtures de M2; nombres como `estados-financieros-2025-demo.pdf`), `InfoSectionVisibility` por defecto, `objective` propio y anónimo (P5), evaluación con ítems coherentes con el estado: `PUBLISHED`/`SUSPENDED` → evaluación completa y score/valoración calculados con las funciones de dominio; `IN_REVIEW` → sin evaluación o parcial; `DRAFT` → incompleta. Imagen de teaser: subir el SVG generado como PNG? No: mantener SVG en `teaserImage` solo para el seed y exponerlo por la misma ruta GET (Content-Type `image/svg+xml` con `Content-Disposition: inline` y CSP restrictiva) o rasterizar — decidir el más simple y seguro y documentarlo.
- Vendedores de demo: `User.organizationId` coherente con sus empresas; el vendedor de "Cafés de Antioquia" ve su oportunidad publicada.
- [ ] Test de seed (idempotencia, conteos, scores en 0–100, valoración = `valuationRange`). Commit `feat(seed): evaluated opportunities and data rooms`

---

### Task 9: E2E H07, H08, H09, H12

**Modelo:** sonnet · **Files:** `e2e/H07-*.spec.ts`, `e2e/H08-*.spec.ts`, `e2e/H09-*.spec.ts`, `e2e/H12-*.spec.ts`, `e2e/security/publication-gate.spec.ts`.
- Flujo: vendedor nuevo (registrado y aprobado vía helpers de M2) registra empresa, financieros, sube documentos a las carpetas requeridas e imagen, define la oportunidad, configura visibilidad y ve la vista previa sin NIT/razón social, envía; admin evalúa la matriz, pide ajustes; vendedor corrige y reenvía; admin aprueba y publica; el vendedor ve "Publicada".
- Seguridad: el vendedor intenta publicar por acción directa → error y estado `IN_REVIEW`; el texto de la vista previa del teaser no contiene la razón social ni el NIT.
- [ ] `pnpm e2e` verde (presupuesto de registros/logins). Commit `test(e2e): H07–H09 and H12`

---

### Task 10: Cierre de M3

**Modelo:** sonnet (docs) + controlador · README (flujo del vendedor y del Back Office), `docs/trazabilidad.md` (H7–H9, H12), `docs/arquitectura.md`, ADR-011 (teaser y anonimato), `docs/plan/m1-pendientes.md` (marcar resueltos y agregar los de M3). Verificación completa, revisión final de rama (opus) y merge local.
