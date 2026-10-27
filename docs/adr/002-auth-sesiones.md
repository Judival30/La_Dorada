# ADR-002: Autenticación con sesiones propias

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

La plataforma tiene tres roles (comprador, vendedor, Back Office) y datos confidenciales que solo pueden verse con NDA vigente y autorización del vendedor (spec §2 R2, §3.2, §6). Se necesita una sesión revocable y control de acceso por rol y por oportunidad.

## Decisión

Sesiones propias en la tabla `Session` (spec §3.2).

- Token aleatorio de 32 bytes, guardado como hash SHA-256; nunca en claro.
- Cookie `httpOnly`, `SameSite=Lax` y `Secure` en producción.
- Expiración de 7 días, deslizante.
- Contraseñas con Argon2id (`@node-rs/argon2`).
- 2FA TOTP opcional (`otplib`).
- Rate limiting en memoria, token bucket por IP y por email, para login, registro y subida de archivos.
- RBAC con roles `BUYER | SELLER | BACKOFFICE`.
- ABAC por oportunidad: vendedor dueño, comprador con acceso y Back Office como supervisor.
- Un usuario que no está `ENABLED` solo puede ver su asistente de registro (spec §3.2).

## Consecuencias

- Revocar una sesión es borrar o invalidar una fila en BD; no hay tokens autocontenidos.
- El rate limiting en memoria se reinicia con cada proceso y no se comparte entre instancias (spec §3.2).
- Argon2id y TOTP añaden dependencias nativas o de cálculo que hay que mantener.
- La política de acceso confidencial (R2, `canAccessConfidential`) se aplica además de la sesión, no reemplaza a la autenticación (spec §6).
