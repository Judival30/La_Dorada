# ADR-008: RustFS en lugar de MinIO

- Estado: Aceptada
- Fecha: 2026-10-27

## Contexto

La spec y los ADR-001 y ADR-007 asumían MinIO como servidor S3-compatible. Las imágenes de MinIO ya no se pueden descargar de Docker Hub ni de quay.io, así que `docker compose up` fallaba al construir el entorno.

## Decisión

Usar `rustfs/rustfs:1.0.4` como servicio `s3` y un contenedor de inicialización `amazon/aws-cli` (`s3-init`) que crea el bucket privado `ladorada-private` y bloquea el acceso público. La API S3 no cambia: el código solo depende de `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` y `S3_BUCKET`.

## Consecuencias

- Hay que probar (smoke test) las URL prefirmadas de 60 s cuando el adaptador de almacenamiento llegue en M2.
- Si RustFS no soporta bien las URL prefirmadas, el plan alternativo es SeaweedFS; el cambio solo toca `docker-compose.yml`.
- Los documentos anteriores que dicen "MinIO" se actualizaron a RustFS; los planes históricos en `docs/plan/` no se reescriben.
