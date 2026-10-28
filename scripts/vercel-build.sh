#!/bin/sh
# Vercel build: migrate and seed through the Supabase session pooler, then build.
# Prints which variables are missing (never their values) before failing.
set -e

echo "[vercel-build] entorno: ${VERCEL_ENV:-desconocido}, rama: ${VERCEL_GIT_COMMIT_REF:-?}"
missing=""
for v in DATABASE_URL DATABASE_URL_MIGRATE S3_ENDPOINT S3_REGION S3_ACCESS_KEY S3_SECRET_KEY APP_URL; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then
    missing="$missing $v"
  else
    echo "[vercel-build] $v definida (${#val} caracteres)"
  fi
done
if [ -n "$missing" ]; then
  echo "[vercel-build] ERROR: faltan o están vacías:$missing"
  echo "[vercel-build] Revísalas en Settings > Environment Variables para el entorno '${VERCEL_ENV:-?}'."
  exit 1
fi

DATABASE_URL="$DATABASE_URL_MIGRATE" prisma migrate deploy
DATABASE_URL="$DATABASE_URL_MIGRATE" prisma db seed
next build
