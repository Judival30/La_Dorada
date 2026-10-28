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
| P10 | ~~Logout / borrado de sesión sin auditar~~ | M2 | **Resuelto (M2):** el logout queda auditado |
| P11 | Middleware re-emite la cookie también en POST de logout | M2 (opcional) | Sin impacto de seguridad. **Sigue abierto** (opcional) |
| P12 | ~~Enlaces de la barra lateral a pantallas inexistentes dan 404~~ | M2+ | **Resuelto (M2):** la navegación los marca "Pronto" |
| P13 | Icono PWA solo SVG; faltan PNG 192/512 | M6 | |
| P14 | 8 archivos fallan `prettier --check`; CI no corre Prettier | M6 | |
| P15 | ~~Smoke test de URLs prefirmadas con RustFS~~ | M2 (adaptador de almacenamiento) | **Resuelto (M2):** las URLs prefirmadas funcionan con RustFS |

## Pendientes de M2

Salida de M2 (Alta y validación), diferidos a milestones posteriores.

| # | Pendiente | Dónde | Notas |
|---|---|---|---|
| M2-1 | Un usuario bloqueado puede iniciar sesión y ve la vista de bloqueo en `/onboarding` (sin escrituras) | Decisión vigente | Intencional; revisar si se prefiere cerrar la sesión |
| M2-2 | Limitadores en memoria (registro, login y subidas) e IP de cliente sin proxy confiable | M6 (antes de desplegar) | Usar almacén compartido y configurar proxy de confianza |
| M2-3 | El ítem de listas restrictivas (screening) del checklist KYC se puede marcar a mano | Pregunta de producto | Definir si requiere evidencia o proveedor real |
| M2-4 | `listUsersForReview` se usa para contar (`/bo` hace 4 consultas de lista para los totales) | M3 | Agregar un helper de conteo |
| M2-5 | La spec de capturas (`e2e/screens`) es opt-in y no corre por defecto | M6 | Valorar incluirla en CI |
| M2-6 | Enumeración de correos por el registro con sesión inmediata | Riesgo aceptado | Reevaluar si se añade verificación de correo |
| M2-7 | SMTP sin autenticación ni TLS | M6 (producción) | Mailpit local lo permite; configurar SMTP real con TLS |
| M2-8 | Textos legales (consentimiento y política de datos) son borradores | Antes de uso real | Revisión por asesor legal |
| M2-9 | Historial de decisiones: el caso guarda solo la última nota de corrección y el último motivo de rechazo | M3 | Tabla `VerificationDecision` con el texto de cada ronda de correcciones y rechazo |
| M2-10 | Helper `countUsersForReview` (ver M2-4) | M3 | Reemplaza las 4 consultas de lista de `/bo` |
| M2-11 | `VerificationCase.decidedById` no es una FK real | M3 | Convertirla en relación con `User` |
| M2-12 | El seed toma el caso más antiguo del usuario y la app el más reciente | M3 | Unificar el criterio (más reciente) |
| M2-13 | Adaptadores en `src/server/{storage,mail,kyc}` y no en `src/server/adapters` | Solo documentación | Ajustar la arquitectura descrita al código |
| M2-14 | "Representación legal verificada" se exige también a compradores ANGEL | Pregunta de producto | Definir si aplica a personas naturales |
| M2-15 | Vacíos del ciclo de vida: REJECTED es terminal sin reapertura; PENDING no vence ni se puede bloquear; los documentos de solicitantes rechazados no tienen regla de retención (Ley 1581) | Decisión de producto antes de producción | Definir reapertura, vencimiento, bloqueo y retención |
| M2-16 | Crear `Organization` / `Company` del vendedor a partir de `profile.step4`, y el choque de NIT (`Organization.nit @unique`) | M3 | Resolver qué pasa si el NIT ya existe |
