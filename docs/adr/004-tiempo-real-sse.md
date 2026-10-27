# ADR-004: Tiempo real con SSE y LISTEN/NOTIFY de Postgres

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

Los usuarios deben recibir avisos de cambios de estado, mensajes y tareas sin recargar la página (spec §3.1 paso 6, §3.4). Las notificaciones se guardan en BD y también deben empujarse en tiempo real.

## Decisión

Endpoint SSE `/api/stream` por usuario (spec §3.4).

- El servidor escucha `LISTEN ladorada_events` en Postgres y reenvía al usuario los eventos dirigidos a él.
- Cada mutación crea una fila en `Notification` y emite `pg_notify` (spec §3.1, paso 6).
- Si SSE falla, el cliente cae a polling cada 15 s (spec §3.4).

## Consecuencias

- Cada usuario conectado mantiene una conexión SSE abierta contra el servidor de la app.
- `LISTEN` requiere una conexión persistente a Postgres; no funciona con una conexión por petición.
- El polling de 15 s es el respaldo y define la latencia máxima en el peor caso.
- Las notificaciones perdidas mientras no hay conexión se recuperan desde la tabla `Notification`, no desde el canal.
