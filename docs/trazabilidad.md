# Trazabilidad de historias H1–H15

Rutas y milestones tomados de la especificación `docs/superpowers/specs/2026-10-26-la-dorada-design.md` §9 y §12. El módulo es una etiqueta de agrupación derivada de las rutas. Endpoint y Test E2E quedan pendientes hasta que su milestone los implemente. M1 (Fundaciones) construyó login, shells por rol y la página de estado de onboarding, que son la base de H6 y H11.

Milestone: `M4 → M5` indica que la historia aparece en M4 con alcance mínimo y se completa en M5 (spec §12). Endpoint y Test usan el milestone de inicio.

| H | Rol | Módulo | Pantalla (ruta) | Endpoint / action | Test E2E | Milestone | Estado |
|---|---|---|---|---|---|---|---|
| H1 | Comprador | Marketplace | `/marketplace`, `/opportunities/[id]`, `/saved`, comparación lado a lado (hasta 3) | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H2 | Comprador | Due diligence | `/processes/[dealId]/due-diligence` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H3 | Comprador/Vendedor | Mensajes y reuniones | `/messages` (reuniones: ruta no definida en la spec) | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H4 | Comprador/Vendedor | Ofertas y negociación | `/processes/[dealId]/offers` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H5 | Comprador | Alertas | `/alerts` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H6 | Vendedor/Comprador | Onboarding | `/onboarding` (wizard de 6 pasos) | M1: login y sesión (`src/server/auth/actions.ts`); wizard pendiente (M2) | `e2e/auth/login-by-role.spec.ts`, `e2e/security/role-isolation.spec.ts` (usuario en revisión va a `/onboarding`); wizard pendiente (M2) | M2 | En progreso (base M1: login, sesión y página de estado) |
| H7 | Vendedor | Empresa | `/seller/company` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H8 | Vendedor | Oportunidad | `/seller/opportunity` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H9 | Vendedor | Visibilidad | `/seller/visibility` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H10 | Vendedor | Solicitudes de acceso | `/seller/access-requests` | pendiente (M4) | pendiente (M4) | M4 | Pendiente |
| H11 | Back Office | Usuarios | `/bo/users` | M1: login y guardas de rol (`src/server/auth/guard.ts`); gestión de usuarios pendiente (M2) | `e2e/auth/login-by-role.spec.ts`, `e2e/security/role-isolation.spec.ts` (aislamiento de `/bo`); gestión pendiente (M2) | M2 | En progreso (base M1: login y shell `/bo`) |
| H12 | Back Office | Evaluación | `/bo/companies/[id]/evaluation` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H13 | Back Office | Confidencialidad | `/bo/confidentiality` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H14 | Back Office | Transacciones | `/bo/transactions` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H15 | Back Office | Reportes | `/bo/reports` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |

## Cobertura de M1

Pruebas E2E existentes tras M1:

- `e2e/auth/login-by-role.spec.ts`: login por rol (comprador, vendedor, Back Office) con redirección a su inicio y menú propio; una contraseña incorrecta muestra error.
- `e2e/security/role-isolation.spec.ts`: un comprador recibe 404 en `/bo` y `/seller`; sin sesión `/marketplace` redirige a `/login`; un usuario en revisión es enviado a `/onboarding`.
- `e2e/screens/screenshots.spec.ts`: capturas de pantallas (no cubre una historia).

El resto de las historias sigue en `pendiente (Mx)`.
