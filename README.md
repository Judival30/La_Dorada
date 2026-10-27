# La Dorada

La Dorada es un marketplace colombiano de fusiones y adquisiciones (M&A) que conecta a vendedores de empresas con compradores calificados (fondos, empresas e inversionistas). Cada rol (comprador, vendedor y Back Office) tiene su propio espacio, con confidencialidad por etapas (teaser, NDA, cuarto de datos), valoración orientativa y trazabilidad de cada acción en un registro de auditoría append-only. Es un proyecto académico: los datos son ficticios y las integraciones externas están simuladas.

Estado: **M1 (Fundaciones)** completo: modelo de datos, autenticación por sesiones, roles, pantallas base de cada rol, onboarding (estado de revisión) y sistema de diseño.

## Prerrequisitos

- Node 24
- pnpm (se activa con `corepack enable`)
- Docker Desktop

## Inicio rápido

```bash
docker compose up -d db s3 s3-init mailpit
cp .env.example .env
pnpm install
pnpm demo:reset   # recrea la BD de desarrollo y carga los datos de demo
pnpm dev          # http://localhost:3000
```

`pnpm demo:reset` borra y recrea la base `ladorada` (datos de demo ficticios). No lo ejecutes sobre datos que quieras conservar.

## Cuentas demo

Todos los datos son **ficticios** (NIT con prefijo `900.`, correos bajo `demo.ladorada.co`). Contraseña de todas: `LaDorada2026!`.

| Rol | Correo | Estado | Entra a |
|---|---|---|---|
| Comprador | `comprador@demo.ladorada.co` | Habilitado | `/marketplace` |
| Vendedor | `vendedor@demo.ladorada.co` | Habilitado | `/seller` |
| Back Office (admin) | `admin@demo.ladorada.co` | Habilitado | `/bo` |
| Comprador en revisión | `revision@demo.ladorada.co` | En revisión | `/onboarding` |

La pantalla de login muestra las tres primeras cuentas solo fuera de producción.

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` / `pnpm start` | Build y servidor de producción |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm format` | Prettier |
| `pnpm test` | Pruebas unitarias (Vitest) |
| `pnpm test:int` | Pruebas de integración contra Postgres (`ladorada_test`) |
| `pnpm e2e` | Pruebas E2E (Playwright) |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:reset` / `pnpm demo:reset` | Reset destructivo de la BD de desarrollo + seed |
| `pnpm seed` | Carga los datos de demo |

## Pruebas

```bash
pnpm test        # unitarias
pnpm test:int    # integración (necesita `db` arriba)
pnpm e2e         # E2E (Playwright; necesita la BD con los datos de demo)
```

- `pnpm test:int` descarta y recrea el esquema de la base de `DATABASE_URL_TEST` (su nombre debe terminar en `_test`) y aplica las migraciones. Ver ADR-009.
- **Limitador de login:** el login permite un número limitado de intentos por ventana. Las pruebas E2E inician sesión varias veces, así que se pueden ejecutar unas **8 veces cada 15 minutos**. El limitador vive en memoria: reinicia `pnpm dev` para reiniciarlo.

## Ejecución completa en Docker

```bash
docker compose up --build
```

Levanta `db`, `s3` (RustFS), `s3-init`, `mailpit`, `migrate` (aplica `prisma migrate deploy` una vez) y `app`. Verifica con `http://localhost:3000/api/health`, que responde `{"status":"ok","db":"up"}`. Para cargar datos de demo en este entorno, usa `pnpm demo:reset` desde tu máquina contra la BD publicada en `localhost:5432`.

Servicios auxiliares: Mailpit en `http://localhost:8025`, consola de RustFS en `http://localhost:9001`.

## Integraciones simuladas

Con `ADAPTERS_MODE=mock` (por defecto) ningún servicio externo es necesario. Cada integración es una interfaz en `src/server/adapters/<x>/` (ADR-003); para conectar una real se escribe una nueva implementación del adaptador, sin tocar los services.

| Integración | Simulada con | Cómo conectar una real |
|---|---|---|
| KYC/AML | Checklist manual del Back Office | Proveedor KYC (p. ej. Truora, Metamap) |
| Firma electrónica NDA/LOI | Sello de tiempo + SHA-256 + IP + user agent (sin validez legal) | DocuSign, Certicámara |
| Videollamada | Enlace Jitsi `meet.jit.si/ladorada-<uuid>` | Jitsi propio o Google Meet API |
| Correo | Mailpit (SMTP local, `SMTP_HOST`/`SMTP_PORT`) | Cualquier SMTP o SES: cambia las variables SMTP |
| Almacenamiento S3 | RustFS local, bucket privado (ADR-008) | Cualquier S3: cambia `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` |

## Estructura del proyecto

```
src/domain/       Lógica pura (máquinas de estado, políticas, valoración, Money/COP)
src/server/       I/O: auth, db (Prisma), audit, env, DTOs
src/app/          Rutas Next.js: (auth) login, (buyer), (seller), (backoffice), onboarding, api
src/components/   Componentes de marca (ld/) y shadcn/ui
src/config/       Navegación por rol
prisma/           schema.prisma, migrations/, seed/
e2e/              Pruebas Playwright (auth/, security/, screens/)
docker/           Inicialización de la BD
docs/             ADR, arquitectura, diseño, trazabilidad, plan
```

## Documentación

- [Especificación](docs/superpowers/specs/2026-10-26-la-dorada-design.md)
- [Arquitectura](docs/arquitectura.md)
- [ADR](docs/adr/)
- [Sistema de diseño](docs/design-system.md)
- [Trazabilidad H1–H15](docs/trazabilidad.md)
- [Preguntas abiertas](docs/preguntas-abiertas.md)
- [Plan de milestones](docs/plan/)

## Habeas Data (Ley 1581 de 2012)

El registro guarda la fecha de consentimiento (`consentAt`) para el tratamiento de datos personales, y el registro de auditoría no almacena datos digitados en intentos de login fallidos (minimización). El texto de consentimiento y la política de tratamiento de datos son borradores: **validar con asesor legal** antes de cualquier uso real.

## Qué no es

La Dorada no es asesoría financiera regulada, no ejecuta compras ni ventas de empresas y no mueve dinero. Las valoraciones y puntajes son orientativos y no reemplazan una debida diligencia profesional. Las firmas de NDA y LOI son simuladas y no tienen validez legal.
