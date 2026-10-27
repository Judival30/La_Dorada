# La Dorada — Roadmap de implementación

**Spec:** `docs/superpowers/specs/2026-10-26-la-dorada-design.md` (aprobada 2026-10-26)
**Método de ejecución:** `superpowers:subagent-driven-development` (definido en el prompt §4).

Cada milestone tiene su propio plan detallado en `docs/plan/`. El plan de un milestone se escribe **al empezar ese milestone**, sobre el código ya integrado, porque sus tareas consumen interfaces reales del milestone anterior.

| M | Plan | Historias | Hecho cuando | Rama / worktree |
|---|---|---|---|---|
| M0+M1 Descubrimiento y fundaciones | `01-m1-fundaciones.md` | — | Login por rol funciona; tests de dominio y permisos verdes; CI verde | `m1-foundations` |
| M2 Alta y validación | `02-m2-alta-validacion.md` (pendiente) | H6, H11 | Usuario nuevo recorre alta → habilitado | `m2-onboarding` |
| M3 Empresa y publicación | `03-m3-empresa-publicacion.md` (pendiente) | H7, H8, H9, H12 | Borrador → publicada solo vía Back Office | `m3-publication` |
| M4 Hilo delgado | `04-m4-hilo-delgado.md` (pendiente) | H1, H10, H13, H2, H4 (mínimos) | Recorrido completo demostrable; test de compuerta confidencial | `m4-thin-thread` |
| M5 Profundización | `05-m5-profundizacion.md` (pendiente) | H1–H5, H13–H15 | E2E de cada H en verde | `m5-depth` |
| M6 Endurecimiento y demo | `06-m6-endurecimiento.md` (pendiente) | — | Demo completa desde `pnpm demo:reset`; revisión de seguridad; a11y; Lighthouse ≥ 90; TOTP 2FA | `m6-hardening` |

## Reparto de modelos (skill `model-router`)

Opus orquesta, integra y verifica. Cada encargo lleva `model` explícito y el formato Objetivo / Contexto / Entrega / No hagas. Fable no se usa.

| Modelo | Tareas |
|---|---|
| `haiku` | Datos seed, microcopys es-CO, ADRs y documentos derivados de la spec, matriz de trazabilidad, ortografía, borradores de README y guion de demo |
| `sonnet` | Scaffold, Docker/CI, pantallas y componentes, endpoints y CRUD, formularios Zod, tests unitarios/E2E, adaptadores mock, reportes |
| `opus` | Máquinas de estado, políticas RBAC/ABAC y compuerta NDA, valoración/score, esquema Prisma, bitácora de auditoría, auth/sesiones, revisión final de cada milestone, depuración que ya falló una vez |

Si un subagente falla, se reintenta una vez con el nivel siguiente.

## Cierre de cada milestone

1. `superpowers:verification-before-completion`: ejecutar y mostrar `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (+ `pnpm test:int` y `pnpm e2e` cuando apliquen).
2. `superpowers:requesting-code-review` (revisor opus) sobre la rama completa.
3. `superpowers:finishing-a-development-branch`: merge local a `main` (sin push ni PR).
4. Actualizar `docs/trazabilidad.md`, `docs/arquitectura.md` y `README.md`.
5. Resumen corto + una línea de reparto de modelos; escribir el plan del siguiente milestone y continuar.
