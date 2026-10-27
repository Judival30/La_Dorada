# ADR-001: Monolito Next.js modular

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

La Dorada es un marketplace web (responsive, PWA) para comprar, vender e invertir en empresas privadas colombianas. Necesita páginas públicas, áreas de comprador, vendedor y Back Office, y una API, con reglas de negocio compartidas (spec §1, §2, §3). La entrega se organiza en milestones, empezando por un esqueleto (spec §12).

## Decisión

Monolito Next.js modular, decisión del usuario (spec §3).

- Next.js 15 (App Router), TypeScript estricto, Tailwind CSS y shadcn/ui.
- Gestor de paquetes pnpm; Node 24.
- PostgreSQL 16 con Prisma 6 y migraciones versionadas.
- MinIO (S3-compatible) con bucket privado.
- Docker Compose con los servicios `app`, `db`, `minio` y `mailpit`.
- Vitest (unidad e integración), Playwright (E2E) y GitHub Actions (lint, typecheck, test, build).
- Capas: `src/domain` (puro, sin I/O), `src/server` (I/O), `src/app` (rutas), `src/components`, `prisma/`, `e2e/` y `docs/` (spec §3.1).
- Orden de trabajo: esqueleto primero (M1 Fundaciones) y luego historias por milestone (spec §12).

## Consecuencias

- Un solo despliegue y un solo repositorio para UI, API y dominio.
- Las reglas R1–R9 se aplican en el servidor, en un flujo común de mutación (spec §2, §3.1).
- `src/domain` no puede hacer I/O, lo que permite probar máquinas de estado y valoración en unidad.
- El acoplamiento entre módulos se controla solo por convención de capas; no hay separación de despliegue.
- Prisma 6 y Next.js 15 quedan fijados por versión; una actualización mayor requiere un ADR nuevo.
