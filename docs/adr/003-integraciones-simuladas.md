# ADR-003: Integraciones simuladas detrás de adaptadores

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

El proyecto no integra servicios reales de KYC, firma electrónica, videollamada ni correo en la demo (spec §13 los deja fuera de alcance). Aun así, los flujos deben poder ejecutarse de punta a punta (spec §1).

## Decisión

Cada integración es una interfaz en `src/server/adapters/<x>/index.ts`, con una implementación `mock` seleccionada por variable de entorno (spec §3.3).

| Integración | Mock | Para producción |
|---|---|---|
| KYC/AML | Checklist manual del Back Office (identidad, representación legal, listas restrictivas "consultadas") | Proveedor KYC (p. ej. Truora/Metamap) |
| Firma electrónica NDA/LOI | Sello de tiempo + SHA-256 del PDF + IP + user agent | Proveedor de firma (p. ej. DocuSign/Certicámara) |
| Videollamada | Enlace `https://meet.jit.si/ladorada-<uuid>` | Jitsi propio / Google Meet API |
| Correo | Mailpit (SMTP local, UI en :8025) | SMTP/SES |

## Consecuencias

- Las firmas NDA/LOI registran sello de tiempo y hash, pero no son firmas electrónicas con validez legal.
- El checklist KYC depende de la revisión manual del Back Office; no consulta listas reales.
- Cambiar a un proveedor real implica escribir una nueva implementación del adaptador, sin tocar los services.
- Los enlaces de Jitsi son de demo y no tienen control de acceso.
