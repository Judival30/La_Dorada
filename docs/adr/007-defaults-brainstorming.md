# ADR-007: Defaults acordados en brainstorming

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

Durante el brainstorming se fijaron valores por defecto para no bloquear la implementación con preguntas abiertas. Los que no están en la spec se marcan como decisión del usuario registrada en el brief.

## Decisión

| Tema | Default | Fuente |
|---|---|---|
| Ejecución local | Docker Compose para `app`, `db`, `minio` y `mailpit` | spec §3 |
| Despliegue | Docker como base y guía para Vercel o Railway | Decisión del usuario (brief); la spec no la detalla |
| Firma NDA/LOI | Simulada con sello de tiempo + SHA-256 del PDF + IP + user agent | spec §3.3 |
| Videollamada | Enlace Jitsi `https://meet.jit.si/ladorada-<uuid>` | spec §3.3 |
| KYC/AML | Checklist manual del Back Office | spec §3.3 |
| Múltiplos de valoración | Por sector, parametrizables en `Setting` | spec §7 |
| Datos de demo | 15 empresas ficticias con NIT del prefijo `900.` | spec §10 |
| Imágenes de teaser | Ilustraciones SVG generadas localmente por sector | spec §10 |

## Consecuencias

- Los defaults permiten ejecutar el recorrido completo sin servicios externos.
- Ningún default usa datos personales reales.
- Cambiar un default de integración implica un nuevo adaptador (ADR-003), no un cambio en el dominio.
- La guía de despliegue en Vercel o Railway queda pendiente de escribirse; la spec no la define.
