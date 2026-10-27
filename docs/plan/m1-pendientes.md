# Pendientes heredados de M1

Salida de la revisión final de M1 (2026-10-27). Cada ítem indica el milestone donde debe resolverse.

| # | Pendiente | Dónde | Notas |
|---|---|---|---|
| P1 | `isPartyConflict` a nivel de organización (R9): comprador que pertenece a la organización de la empresa vendedora | M4 | Hoy solo compara `userId === sellerId`, nunca dispara |
| P2 | Evento `WITHDRAW` del comprador en la máquina de acceso (R5 en etapa Contacto/NDA) + valor `WITHDRAWN` | M4 | `ALTER TYPE ... ADD VALUE` |
| P3 | Evaluation: una sola fuente de verdad entre columnas (`financialConsistency`, `customerDependency`, `legalContingencies`) y `EvaluationItem`; función pura de mapeo `EvaluationItemStatus` → entradas de `computeScore` | M3 (antes de H12) | |
| P4 | Guarda de producción en el seed (`ALLOW_DEMO_SEED=1`, rechazar hosts no locales) | M6 (antes de cualquier despliegue) | Crea cuenta BACKOFFICE con contraseña pública |
| P5 | Anonimato del teaser: `Opportunity.objective` reutiliza la descripción con ciudad y detalles | M3 (antes del serializador de teaser) | R2(b) |
| P6 | Acceso confidencial con oportunidad `CLOSED`: limitar al comprador que cerró o revocar al cerrar | M4 | |
| P7 | `canAcceptOffer(lastOfferAuthor, actor)` junto a `dealMachine` (contraparte) | M4 | |
| P8 | `Deal.stage` almacenado vs. derivado del estado (spec §5) | M4 | Preferir derivarlo |
| P9 | Limitador por IP pura (password spraying) y `.max(2048)` en `next` | M6 | |
| P10 | Logout / borrado de sesión sin auditar | M2 | Decidir con el helper `audited()` |
| P11 | Middleware re-emite la cookie también en POST de logout | M2 (opcional) | Sin impacto de seguridad |
| P12 | Enlaces de la barra lateral a pantallas inexistentes dan 404 | M2+ | Marcar "pronto" o crear la ruta |
| P13 | Icono PWA solo SVG; faltan PNG 192/512 | M6 | |
| P14 | 8 archivos fallan `prettier --check`; CI no corre Prettier | M6 | |
| P15 | Smoke test de URLs prefirmadas con RustFS | M2 (adaptador de almacenamiento) | Alternativa: SeaweedFS |
