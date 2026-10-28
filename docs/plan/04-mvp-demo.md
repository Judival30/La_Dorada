# MVP demostrable (recorrido de punta a punta delgado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Entrega parcial al profesor en 1–2 días: con las cuentas demo se recorre publicar empresa → Back Office aprueba → comprador la encuentra → pide acceso + NDA → vendedor autoriza → data room → oferta ⇄ contraoferta → LOI → cierre o desistimiento, con front y backend reales.

**Architecture:** Sobre M1–M2 y el dominio de M3 (`605eb93`). Recorrido delgado: una pantalla funcional por etapa; seed completo para arrancar la demo en cualquier punto. Absorbe el resto de `03-m3-empresa-publicacion.md` (versión mínima) y lo esencial de M4.

**Spec:** `docs/superpowers/specs/2026-10-26-la-dorada-design.md`. Pendientes: `docs/plan/m1-pendientes.md` (P5, P6, P7, P8 se resuelven aquí en su versión mínima).

## Global Constraints
- Las de `docs/plan/03-m3-empresa-publicacion.md` § Global Constraints (incluye R1, R3, teaser solo vía `toTeaser`, archivos) + las de M1/M2 (es-CO, Zod, `audited()`, sin PII en AuditLog, guards, máquinas de estado, resets solo por el controlador, sin push).
- **Calidad "real pero mínima":** TDD solo en servicios con reglas (envío, decisión BO, compuerta NDA, ofertas). UI sin tests unitarios; cubierta por `e2e/demo-journey.spec.ts`. Una revisión por tarea, máximo una ronda de corrección.
- Copys en es-CO; pantallas con `src/components/ld/*` y la skill frontend-design; las secundarias pueden ser sobrias.
- `canAccessConfidential` (`src/domain/policies/confidential.ts`) es la ÚNICA puerta del data room (R2): consultas, listado y descarga.

## Review Focus
1. URL directa a un documento del data room sin NDA vigente + autorización → 404 y `ACCESS_DENIED` auditado (T5).
2. Vendedor no puede publicar ni aprobar su propia oportunidad (R1) (T2).
3. Back Office no puede transicionar ofertas/LOI/cierre (R4); comprador no puede aceptar su propia oferta (P7) (T6).
4. El teaser público nunca contiene razón social, NIT ni ciudad (T0/T4).
5. Comprador puede desistir en cualquier etapa; el expediente termina `CLOSED` o `WITHDRAWN` (T6).

---

### Task 0: Revisión del dominio de M3 (Task 2)

**Modelo:** revisión sonnet; corrección (si hace falta) sonnet.
- Revisar `605eb93` contra `docs/plan/03-m3-empresa-publicacion.md` Task 2: NIT DIAN, esquemas, `toTeaser` (sin legalName/NIT/ciudad, secciones ocultas ausentes, ingresos en rango), `toScoreInput` (P3), `opportunityReadiness`, migración `evaluation_single_source`.
- [ ] Revisión; una ronda de corrección máx.

---

### Task 1: Seed de demo completo

**Modelo:** sonnet · **Files:** `prisma/seed/**`, `src/server/opportunities/teaser-image.ts` (si aplica).
- Para las 15 oportunidades: `DataRoomFolder` según `DATA_ROOM_FOLDERS` (con `required`), 1–3 documentos PDF ficticios por carpeta requerida en S3 (`dataroom/<oppId>/<uuid>`, fixtures de `prisma/seed/fixtures.ts`), `InfoSectionVisibility` con `defaultVisibility()`, `objective` y `description` anónimos (P5: sin ciudad, sin razón social).
- `PUBLISHED`/`SUSPENDED`: `Evaluation` + 4 `EvaluationItem` coherentes; `valuationLow/High`, `score`, `breakdown`, `docsDelivered/Required` calculados con `valuationRange` (múltiplos de `Setting.sectorMultiples`) y `computeScore(toScoreInput(...))`. `ReviewDecision` APPROVE por admin. `IN_REVIEW` (2): sin evaluación, carpetas completas → una se aprueba en vivo en la demo. `DRAFT`: incompleta.
- Imagen de teaser: rasterizar no es necesario; servir el SVG del seed por `GET /api/opportunities/[id]/teaser-image` con `Content-Type: image/svg+xml`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` (el SVG es generado por el servidor, no por usuarios). Imágenes subidas por vendedores (T2) se guardan en S3 y la misma ruta las redirige a URL firmada.
- Proceso avanzado de demo: `comprador@demo.ladorada.co` con `AccessRequest` AUTHORIZED + `NdaSignature` vigente (1 año) sobre **Cafés de Antioquia**, y `Deal` en `COUNTER_OFFER` con 2 ofertas (comprador → contraoferta del vendedor). Otro comprador ficticio con solicitud `NDA_SIGNED` pendiente de autorización sobre Cafés de Antioquia (para mostrar H10).
- `ReviewDecision` para usuarios decididos del seed (pendiente de M3 T1).
- [ ] Test de seed (memory storage): conteos, scores 0–100, valoración = `valuationRange`, idempotencia, `toTeaser` de cada publicada no contiene su `legalName`.
- [ ] Commit `feat(seed): complete demo dataset for MVP journey`

---

### Task 2: Publicación del vendedor (H7–H9 mínimo)

**Modelo:** sonnet (servicio + UI) · revisión opus · **Files:** `src/server/services/company.ts`, `src/server/services/opportunity.ts`, `src/app/(seller)/seller/**`, rutas `/api/opportunities/[id]/documents` y `/api/opportunities/[id]/teaser-image` (POST), tests int.
```ts
ensureSellerCompany(actor): Promise<{ opportunityId: string }>   // Organization(COMPANY)+Company+Opportunity(DRAFT, generateCodename, carpetas, defaultVisibility) desde VerificationCase.profile.step4; NIT duplicado → ValidationError es-CO; vincula User.organizationId
getSellerOpportunity(actor, id): Promise<SellerOpportunityView>   // empresa, financieros, definición, visibilidad, carpetas+docs, readiness, último ReviewDecision, teaser preview (toTeaser, evaluation null)
saveCompany(actor, id, data) / saveFinancials(actor, id, years) / saveDefinition(actor, id, data) / saveVisibility(actor, id, rows)
uploadDataRoomDocument(actor, id, folderId, file) / deleteDataRoomDocument(actor, docId) / uploadTeaserImage(actor, id, file)
submitOpportunity(actor, id)  // opportunityReadiness completo; SUBMIT|RESUBMIT; notify BO OPPORTUNITY_TO_REVIEW
```
- Todo con `requireActor('SELLER')`, oportunidad del vendedor (ajena → 404), edición solo `DRAFT`/`ADJUSTMENTS_REQUESTED` bajo `FOR UPDATE` (si no, 409).
- UI: `/seller` (tarjetas de oportunidades con estado y CTA; si no hay empresa: "Registrar mi empresa"); `/seller/opportunities/[id]` una página con secciones plegables (slides 08–10): Empresa, Estados financieros (3 años, millones), Oportunidad (modalidad en tarjetas), Visibilidad (toggles + vista previa del teaser), Documentos por carpeta, Imagen; panel lateral "Qué falta" + "Enviar a revisión"; notas de ajustes del BO.
- [ ] Tests int: vendedor no puede publicar (R1); envío incompleto → faltantes; edición en IN_REVIEW → 409; NIT duplicado. Commit `feat(seller): minimal company and opportunity publication`

---

### Task 3: Evaluación Back Office (H12 mínimo)

**Modelo:** sonnet · revisión sonnet · **Files:** `src/server/services/opportunity-review.ts`, `src/app/(backoffice)/bo/companies/**`, `src/config/nav.ts`.
```ts
listOpportunitiesForReview(actor, { status? }) / countOpportunitiesForReview(actor)
getOpportunityEvaluation(actor, id)     // empresa (BO ve razón social/NIT), financieros, carpetas, valoración (valuationRange con Setting) o 'Faltan estados financieros', calidad de información, matriz, score, teaser preview, historial ReviewDecision
setEvaluationItem(actor, id, kind, status, notes?)   // persiste Evaluation recalculada
decideOpportunity(actor, id, APPROVE_AND_PUBLISH | REQUEST_ADJUSTMENTS(notes) | REJECT(reason))   // lock, opportunityMachine, opportunityApprovalBlockers, publishedAt, recordDecision, notify vendedor
```
- UI (slide13): cola con pestañas por estado; detalle con rango de valoración + `Disclaimer`, calidad de información, matriz con selects, score, vista previa del teaser, acciones (Aprobar y publicar deshabilitado con bloqueos listados).
- [ ] Tests int: aprobar con ítems pendientes → ValidationError; flujo ajustes → reenvío → publicar; SELLER → 403. Commit `feat(backoffice): minimal opportunity evaluation`

---

### Task 4: Marketplace y teaser (H1 mínimo)

**Modelo:** sonnet · revisión sonnet · **Files:** `src/server/services/marketplace.ts`, `src/app/(buyer)/marketplace/page.tsx`, `src/app/(buyer)/opportunities/[id]/page.tsx`, `src/components/ld/opportunity-card.tsx`.
```ts
searchMarketplace(actor, filter: { sector?; department?; revenue?: bucketKey; ebitda?: bucketKey; type?; q?; order?: 'recent'|'score' }): Promise<{ items: Teaser[]; total: number; kpis: { published: number; inDueDiligence: number; verifiedBuyers: number } }>   // solo PUBLISHED; todo pasa por toTeaser; filtros de ingresos/EBITDA por rangos sobre el último año
getTeaser(actor, id): Promise<Teaser & { access: { status: AccessStatus | null; canOpenDataRoom: boolean }; dealId: string | null }>   // 404 si no PUBLISHED (salvo dueño/BO)
```
- `requireUser('BUYER')`. UI como slide02: KPIs, barra de filtros (Sector, Región, Ingresos anuales, EBITDA, Tipo), "N oportunidades encontradas", orden, tarjetas (imagen, chip de modalidad, nombre clave, sector | departamento, resumen, 4 métricas en rango, "Ver teaser"). Teaser: secciones públicas, valoración + score con `Disclaimer`, CTA según estado de acceso ("Solicitar acceso" / "Firmar NDA" / "Esperando autorización" / "Abrir data room" / "Ver proceso").
- [ ] Test int: filtros combinados correctos con el seed; ninguna respuesta contiene `legalName`/NIT. Commit `feat(buyer): marketplace and teaser`

---

### Task 5: Acceso, NDA y data room (H10, H13, H2 mínimo)

**Modelo:** opus (servicio) + sonnet (UI) · revisión opus · **Files:** `src/server/services/access.ts`, `src/server/services/data-room.ts`, `src/server/adapters/esign/mock.ts`, `src/app/api/documents/[id]/route.ts`, `src/app/(buyer)/opportunities/[id]/access/**`, `src/app/(buyer)/opportunities/[id]/data-room/page.tsx`, `src/app/(seller)/seller/access-requests/**`, `src/app/(backoffice)/bo/confidentiality/page.tsx`.
```ts
requestAccess(actor, opportunityId, { purpose })      // BUYER ENABLED, opp PUBLISHED, no isPartyConflict; crea AccessRequest REQUESTED (relevance calculada simple: coincidencia de sector/región con BuyerPreferences, 0–100); notify vendedor
signNda(actor, accessRequestId)                        // mock e-sign: documentHash = sha256(texto NDA + ids + timestamp), signedAt, expiresAt = +365 d, ip/UA; accessMachine SIGN_NDA
listAccessRequests(actor /*SELLER*/, filter) / decideAccess(actor, id, 'APPROVE'|'REJECT')   // accessMachine; al aprobar crea Deal? NO — el Deal se crea con la primera oferta
revokeAccess(actor /*SELLER|BACKOFFICE*/, id)
getDataRoom(actor, opportunityId)                      // solo si canAccessConfidential (o dueño/BO): carpetas + documentos (sin URLs)
documentDownloadUrl(actor, documentId)                 // re-evalúa canAccessConfidential; audita DOCUMENT_DOWNLOADED / ACCESS_DENIED; presignGet 60 s con Content-Type/Disposition forzados
listConfidentiality(actor /*BACKOFFICE*/)              // tabla empresa × comprador × estado NDA (Firmado/Vencido/Pendiente) × acceso
```
- Texto del NDA de demo en `src/content/nda.ts` (es-CO, "documento de referencia, no vinculante").
- [ ] Tests int (TDD): sin NDA → 404 en la ruta y fila `ACCESS_DENIED`; NDA vencido → 404; acceso revocado → 404; autorizado → 302 firmada; vendedor de la oportunidad no puede pedir acceso (R9); BO ve tabla. Commit `feat(access): NDA, seller authorization and gated data room`

---

### Task 6: Ofertas, LOI y cierre (H4 mínimo)

**Modelo:** opus (servicio) + sonnet (UI) · revisión opus · **Files:** `src/domain/deal.ts` (`canAcceptOffer`, `dealStageOf`), `src/server/services/deal.ts`, `src/app/(buyer)/processes/[dealId]/**` (compartida comprador/vendedor vía `/processes/[dealId]` con autorización por parte), tests.
```ts
canAcceptOffer(lastOfferAuthor: 'BUYER'|'SELLER', actorRole: 'BUYER'|'SELLER'): boolean   // solo la contraparte
dealStageOf(access, deal): DealStage                                                       // derivado (P8)
makeOffer(actor /*BUYER con canAccessConfidential*/, opportunityId, offer)   // crea Deal OFFER_SENT si no existe o contraoferta del comprador
counterOffer(actor /*SELLER dueño*/, dealId, offer)
acceptOffer(actor, dealId)            // contraparte; PRELIMINARY_AGREEMENT; genera Loi (hash del texto con los términos)
signLoi(actor, dealId)                // cada parte firma; cuando ambas → LOI_SIGNED
startDueDiligence(actor, dealId) / confirmClose(actor, dealId)   // cierre requiere confirmación de ambas partes (dos timestamps); → CLOSED; opportunity CLOSE (SYSTEM)
withdraw(actor, dealId, reason?)      // comprador o vendedor; → WITHDRAWN
getDeal(actor, dealId)                // comprador del deal, vendedor dueño o BO (solo lectura); 404 otros
```
- Migración aditiva si hace falta para confirmar cierre por ambas partes (`Deal.buyerClosedAt`, `Deal.sellerClosedAt`). `Deal.stage` se deja de escribir; se usa `dealStageOf`.
- UI (slide05): stepper, "Oferta actual" (campos), historial de ofertas, botones según `dealMachine.availableEvents` + `canAcceptOffer`, carta de intención con estado de firmas, botón Desistir con confirmación; avisos `Disclaimer` en ofertas (R3/R7).
- [ ] Tests int (TDD): BO no puede ninguna transición (R4); comprador no acepta su propia oferta; flujo completo hasta CLOSED; desistir desde cada etapa no terminal. Commit `feat(deals): offers, LOI and closing`

---

### Task 7: Notificaciones y "Mis procesos" (H5 mínimo)

**Modelo:** sonnet · revisión haiku · **Files:** `src/server/services/notifications.ts`, `src/components/ld/notification-bell.tsx`, `src/app/(buyer)/processes/page.tsx`, `src/app/(seller)/seller/processes/page.tsx` (o reutilizar), `src/config/nav.ts`.
- Campana en la topbar (contador de no leídas, popover con las 10 últimas, "Marcar todas como leídas"), textos por `NotificationKind`; `/processes`: tarjetas por proceso con nombre clave, etapa (`dealStageOf`) y barra de avance. Activar en la navegación solo lo que existe; lo demás sigue "Pronto".
- [ ] Commit `feat(ui): notifications bell and processes list`

---

### Task 8: E2E del recorrido y guion de demo

**Modelo:** sonnet (E2E) + haiku (guion) · **Files:** `e2e/demo-journey.spec.ts`, `e2e/security/confidential-gate.spec.ts`, `docs/demo/guion-mvp.md`.
- `demo-journey`: admin aprueba la oportunidad `IN_REVIEW` sembrada → comprador la ve en el marketplace con filtros → pide acceso → firma NDA → vendedor autoriza → comprador abre data room y descarga (302 con firma) → oferta → vendedor contraoferta → comprador acepta → ambos firman LOI → DD → ambos confirman cierre → estado "Cerrado".
- `confidential-gate`: comprador sin acceso pide `/api/documents/<id>` → 404; tras revocar → 404.
- Guion 12–15 min: cuentas, orden de clics, qué regla de negocio ilustra cada paso (R1–R8), plan B si algo falla (arrancar desde el proceso sembrado).
- [ ] `pnpm e2e` verde. Commit `test(e2e): MVP demo journey` + `docs: MVP demo script`

---

### Task 9: Cierre del MVP

**Modelo:** controlador + opus (revisión final) · README (sección "Demo MVP"), `docs/trazabilidad.md` (H1, H2, H4, H5, H7–H10, H12, H13 en versión mínima), `docs/plan/m1-pendientes.md` (resueltos y pendientes del MVP), `docs/plan/00-roadmap.md` (M3/M4 absorbidos por el MVP; siguiente: profundización). Verificación completa + `demo:reset` + `pnpm e2e`; revisión final de rama; merge local a `main`.
