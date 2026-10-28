# Guion de demo: La Dorada MVP (borrador)

Presentación al profesor, 12–15 min. Todos los datos son ficticios. Contraseña de todas las cuentas: `LaDorada2026!`.

Leyenda: **Quién** = sesión activa · **Clicks** = ruta y acción · **Decir** = guion sugerido · **Demuestra** = regla (R1–R8) o historia (H1–H15).

---

## 1. Preparación

### 1.1 Arranque (15 min antes de presentar)

```bash
docker compose up -d db s3 s3-init mailpit   # como en el README; la app corre con pnpm dev
pnpm demo:reset                              # BORRA y recrea la BD "ladorada" con el seed
pnpm dev                                     # http://localhost:3000
```

- `pnpm demo:reset` es destructivo. Ejecútalo una vez antes de la presentación, no durante ella.
- Verifica `http://localhost:3000/api/health` → `{"status":"ok","db":"up"}`.
- Abre Mailpit en `http://localhost:8025` en una pestaña.
- No corras `pnpm e2e` justo antes de presentar: la suite consume los limitadores de login.

### 1.2 Cuentas

| Rol | Correo | Estado en el seed | Para qué |
|---|---|---|---|
| Back Office | `admin@demo.ladorada.co` | Habilitado | Usuarios, evaluación, publicación, confidencialidad |
| Comprador | `comprador@demo.ladorada.co` | Habilitado | Marketplace; NDA firmado y acceso autorizado a Cafés de Antioquia; contraoferta pendiente |
| Vendedor | `vendedor@demo.ladorada.co` | Habilitado | Dueño de Cafés de Antioquia; autoriza accesos; contraoferta |
| Comprador 2 | `inversiones.pacifico@demo.ladorada.co` | Habilitado | NDA firmado, esperando autorización en Cafés de Antioquia |
| En revisión | `revision@demo.ladorada.co` | En revisión | Solo para la prueba de URL bloqueada (paso 9) |

Empresas IN_REVIEW (para aprobar en vivo): **Metalúrgica Cordillera** (manufactura, Risaralda) es la recomendada; **Lácteos del Ruiz** (alimentos, Caldas) es la de respaldo. Sus vendedores (Hernán Castaño y Juliana Mora) no se usan en la demo.

### 1.3 Ventanas o perfiles

Las sesiones son cookies por navegador, así que cada cuenta necesita su propio perfil o ventana de incógnito.

- **Perfil A** (Chrome normal): Back Office (`admin`) y Mailpit.
- **Perfil B**: comprador (`comprador@`).
- **Perfil C**: vendedor (`vendedor@`).
- **Perfil D** (incógnito): Pacífico, y luego `revision@` (paso 9).

Antes de empezar, cierra sesión en todos los perfiles y deja cada uno en la pantalla de login.

---

## 2. Guion cronometrado

### 0:00–1:00 · Contexto (1 min)

- **Quién:** nadie (sin sesión).
- **Clicks:** abrir `http://localhost:3000`.
- **Decir:** "La Dorada es un marketplace para comprar, vender e invertir en empresas privadas colombianas. Voy a recorrer el proceso completo, desde la validación hasta el cierre. En cada paso indico qué regla lo sostiene."
- **Demuestra:** visión general.

### 1:00–2:30 · Validación de usuarios (1,5 min)

- **Quién:** Back Office (perfil A).
- **Clicks:** login con `admin@`, luego `/bo/users`. Abrir la solicitud de `andres.bernal@demo.ladorada.co` (en revisión). Revisar documentos, completar la lista KYC y aprobar.
- **Decir:** "Nadie entra a la plataforma sin verificación. Cada decisión queda auditada y el usuario recibe un correo." Cambiar al tab de Mailpit para mostrar el correo.
- **Demuestra:** H11. R6 (trazabilidad) en el registro de auditoría.

### 2:30–4:00 · Back Office evalúa y publica (1,5 min)

- **Quién:** Back Office (perfil A).
- **Clicks:** `/bo/companies` → **Metalúrgica Cordillera** → `/bo/companies/[id]`. Revisar la empresa y el teaser. Poner los tres ítems de la matriz en estado aprobado (selects). Pulsar **Aprobar y publicar**.
- **Decir:** "Solo el Back Office puede publicar. Ni el vendedor ni el comprador pueden saltarse esta revisión. La valoración es orientativa y no obliga a nadie."
- **Si el botón está deshabilitado:** la pantalla lista los bloqueos; completa ese punto y vuelve a intentar.
- **Demuestra:** H12, R1. R3 (valoración orientativa).

### 4:00–5:30 · Comprador busca, filtra y ve el teaser (1,5 min)

- **Quién:** comprador (perfil B).
- **Clicks:** login, `/marketplace`. Ver los KPIs. Filtrar por **Sector: Manufactura**, luego por **Región: Risaralda** o búsqueda. Aparece Metalúrgica Cordillera. Abrir **Ver teaser**.
- **Decir:** "El teaser muestra un nombre clave, el sector y el departamento. No muestra razón social, NIT ni ciudad. Lo que es público se decide sección por sección."
- **Demuestra:** H1, R2 (lo que no es teaser nunca sale).

### 5:30–7:00 · Solicita acceso y firma NDA (1,5 min)

- **Quién:** comprador (perfil B).
- **Clicks:** en el teaser de Metalúrgica, **Solicitar acceso** → `/opportunities/[id]/acceso` → escribir el propósito → enviar → **Firmar NDA**.
- **Decir:** "Pedir acceso no abre documentos. Primero debe firmar un acuerdo de confidencialidad. La autorización la da el vendedor."
- **Nota:** esta solicitud queda pendiente (la autorización la daría el dueño, Hernán Castaño). Eso está bien: el paso siguiente usa Cafés.
- **Demuestra:** H10.

### 7:00–8:00 · Vendedor autoriza a Inversiones Pacífico (1 min)

- **Quién:** vendedor (perfil C), dueño de Cafés de Antioquia.
- **Clicks:** login con `vendedor@`, `/seller/access-requests`. Pestaña de pendientes → **Inversiones Pacífico** (NDA firmado, relevancia 78) → aprobar (verificar la etiqueta en pantalla).
- **Decir:** "El NDA firmado no basta. El vendedor decide quién entra a su información."
- **Demuestra:** H10, R2 (autorización del vendedor).

### 8:00–9:00 · Data room y descarga (1 min)

- **Quién:** comprador (perfil B) sobre Cafés de Antioquia.
- **Clicks:** `/marketplace` → Cafés de Antioquia → **Abrir data room** → `/opportunities/[id]/data-room`. Abrir una carpeta, descargar un PDF (302 a una URL firmada de 60 s). Copiar el enlace del documento (`/api/documents/<id>`) para el paso 9.
- **Decir:** "Los documentos salen solo con NDA vigente y autorización. La URL que genera dura un minuto."
- **Demuestra:** H2, R2.

### 9:00–9:45 · URL directa sin NDA: bloqueada (0,75 min)

- **Quién:** `revision@` (perfil D, después de cerrar la sesión de Pacífico).
- **Clicks:** login con `revision@`. Pegar en la barra el enlace copiado en el paso 8.
- **Resultado esperado:** 404. Se registra `ACCESS_DENIED` en la auditoría.
- **Decir:** "Aunque alguien conozca la URL, sin NDA y autorización no hay documento. Se registra el intento."
- **Demuestra:** R2 (y R6).

### 9:45–10:30 · Back Office ve la tabla de confidencialidad (0,75 min)

- **Quién:** Back Office (perfil A).
- **Clicks:** `/bo/confidentiality`. Tab de acuerdos NDA (estado Firmado / Vencido / Pendiente). Tab de permisos activos (Cafés: comprador y Pacífico autorizados). Tab de auditoría (el `ACCESS_DENIED` del paso 9). Nombres de tabs: verificar en pantalla.
- **Decir:** "El Back Office ve la confidencialidad y puede revocar por incumplimiento, pero no decide por las partes."
- **Demuestra:** H13. R4 (supervisa, no decide).

### 10:30–13:00 · Proceso: contraoferta, aceptar, LOI, cierre (2,5 min)

Usa el proceso sembrado de Cafés de Antioquia: está en **COUNTER_OFFER** (la última oferta es del vendedor).

- **Quién:** comprador (perfil B).
- **Clicks:** `/processes` → proceso de Cafés → `/processes/[dealId]`. Ver el historial de ofertas. Pulsar **Aceptar** en la contraoferta del vendedor (la pantalla solo ofrece aceptar a la contraparte). Luego firmar la carta de intención (LOI).
- **Quién (segunda firma):** vendedor (perfil C), mismo proceso: **Firmar LOI**.
- **Cierre:** la pantalla muestra el siguiente paso (due diligence y confirmación de cierre de ambas partes). Mostrar el botón sin ejecutar todo si no hay tiempo. Los pasos exactos son los de la pantalla en construcción; describir en voz alta.
- **Decir:** "Ofertas, contraofertas y LOI son registros: no hay pasarela de pagos. El Back Office no tiene botones para decidir por las partes. El comprador puede desistir en cualquier etapa; no lo hago ahora."
- **Demuestra:** H4, R4 (el Back Office no transiciona), R5 (desistir existe en cualquier etapa no terminal), R8 (no se mueve dinero).

### 13:00–14:30 · Cierre: qué falta (1,5 min)

- **Quién:** ninguno, o pantalla del marketplace.
- **Decir:** "Lo que vieron es el hilo completo del MVP. Falta profundizar: mensajes y reuniones (H3), alertas (H5), métricas del Back Office (H14, H15), due diligence completa con Q&A (H2) y reemplazar las integraciones simuladas (KYC, firma electrónica, videollamada) por proveedores reales."
- **Demuestra:** visión de alcance. Cerrar con la sección 4 de este guion.

---

## 3. Plan B

| Si falla | Qué hacer |
|---|---|
| La publicación de Metalúrgica no sale | Usa Cafés de Antioquia (ya publicada). Si quieres mostrar la publicación en vivo, usa Lácteos del Ruiz como respaldo. |
| El paso de acceso o NDA falla | Muestra el estado sembrado de Pacífico en `/opportunities/[id]/acceso` (NDA firmado, esperando autorización) y sigue con el paso 7. |
| Un paso del proceso falla | Entra como comprador (perfil B) → `/processes` → proceso sembrado de Cafés (COUNTER_OFFER). Empieza desde la contraoferta. |
| Login rechazado con "demasiados intentos" | Los limitadores viven en memoria: el login permite 5 por minuto por IP+correo y 20 por 15 min por correo. Reinicia `pnpm dev` y espera un minuto antes de volver a entrar. |
| Estado roto o demasiados cambios de ensayo | Solo si hay tiempo: `pnpm demo:reset` y reinicia `pnpm dev`. Borra todos los datos de la BD local. |
| Mailpit no abre | Salta el correo del paso 1 y menciona que las notificaciones van por correo simulado. |

Si el tiempo se acaba, prioriza en este orden: publicación (paso 3), teaser (paso 4), autorización y data room (pasos 7–8), URL bloqueada (paso 9), proceso (paso 10). El resto puede resumirse en una frase.

---

## 4. "Qué no hace la plataforma"

Leer al cierre, en voz alta:

- **No es asesoría financiera regulada.** Las valoraciones y los puntajes son orientativos (R3) y no reemplazan la debida diligencia profesional.
- **No ejecuta compras ni ventas automáticas.** Un comprador o un vendedor decide cada paso (R7).
- **No mueve dinero.** Las ofertas y las LOI son registros; no hay pasarela de pagos ni custodia (R8).
- **Las firmas de NDA y LOI son simuladas** y no tienen validez legal. Los datos son ficticios.
