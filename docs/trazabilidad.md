# Trazabilidad de historias H1–H15

Rutas y milestones tomados de la especificación `docs/superpowers/specs/2026-10-26-la-dorada-design.md` §9 y §12. El módulo es una etiqueta de agrupación derivada de las rutas. Endpoint y Test E2E quedan pendientes hasta que su milestone los implemente.

Milestone: `M4 → M5` indica que la historia aparece en M4 con alcance mínimo y se completa en M5 (spec §12). Endpoint y Test usan el milestone de inicio.

| H | Rol | Módulo | Pantalla (ruta) | Endpoint / action | Test E2E | Milestone | Estado |
|---|---|---|---|---|---|---|---|
| H1 | Comprador | Marketplace | `/marketplace`, `/opportunities/[id]`, `/saved`, comparación lado a lado (hasta 3) | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H2 | Comprador | Due diligence | `/processes/[dealId]/due-diligence` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H3 | Comprador/Vendedor | Mensajes y reuniones | `/messages` (reuniones: ruta no definida en la spec) | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H4 | Comprador/Vendedor | Ofertas y negociación | `/processes/[dealId]/offers` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H5 | Comprador | Alertas | `/alerts` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H6 | Vendedor/Comprador | Onboarding | `/onboarding` (wizard de 6 pasos) | pendiente (M2) | pendiente (M2) | M2 | Pendiente |
| H7 | Vendedor | Empresa | `/seller/company` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H8 | Vendedor | Oportunidad | `/seller/opportunity` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H9 | Vendedor | Visibilidad | `/seller/visibility` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H10 | Vendedor | Solicitudes de acceso | `/seller/access-requests` | pendiente (M4) | pendiente (M4) | M4 | Pendiente |
| H11 | Back Office | Usuarios | `/bo/users` | pendiente (M2) | pendiente (M2) | M2 | Pendiente |
| H12 | Back Office | Evaluación | `/bo/companies/[id]/evaluation` | pendiente (M3) | pendiente (M3) | M3 | Pendiente |
| H13 | Back Office | Confidencialidad | `/bo/confidentiality` | pendiente (M4) | pendiente (M4) | M4 → M5 | Pendiente |
| H14 | Back Office | Transacciones | `/bo/transactions` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
| H15 | Back Office | Reportes | `/bo/reports` | pendiente (M5) | pendiente (M5) | M5 | Pendiente |
