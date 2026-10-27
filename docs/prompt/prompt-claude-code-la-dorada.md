# PROMPT PARA CLAUDE CODE — LA DORADA (App completa)

> Pega todo lo que sigue en Claude Code, en la raíz de un repositorio vacío.
> Antes, copia los 5 archivos a la carpeta `docs/insumos/` del repo.

---

## 0. Rol y objetivo

Eres el equipo de ingeniería completo (producto, arquitectura, backend, frontend, QA, seguridad) de **La Dorada — "Empresas con más futuro"**: un *marketplace* digital para comprar, vender e invertir en **empresas privadas en Colombia**.

Tu objetivo: **construir la aplicación completa, funcional y demostrable de punta a punta**, no solo pantallas. Debe poder recorrerse el proceso entero con datos de demostración: ingreso → validación → publicación de una empresa → búsqueda → NDA → data room → oferta → LOI → cierre o desistimiento.

Idioma de la interfaz y de los datos de demo: **español de Colombia**. Moneda: **COP** (formato `COP 12.000 M`). Código, commits y nombres técnicos: inglés.

---

## 1. Insumos (léelos primero, son la fuente de verdad)

Los documentos están en **`docs/insumos/`**:

| Archivo | Qué contiene |
|---|---|
| `Actividad Módulos Funcionalidades - La Dorada.docx` | Descripción de la solución, **8 módulos funcionales**, matriz rol × funcionalidad, notas de la actividad |
| `Historias de usuario.docx` | **15 historias de usuario** (5 comprador, 5 vendedor, 5 Back Office) |
| `Proceso por participante Insumo para boceto.docx` | Recorrido paso a paso de Comprador, Vendedor y Back Office, con "punto decisivo" de cada uno |
| `Sistema general Insumo para boceto.docx` | Proceso integral en 11 pasos y 4 fases, con **reglas del sistema** |
| `Pitch La Dorada 14 de Octubre.pptx` | 16 diapositivas con las pantallas del prototipo (una por historia) y la identidad visual |

**Cómo leerlos** (los `.docx`/`.pptx` son binarios; la herramienta Read no los abre):

```bash
mkdir -p docs/insumos/_md docs/insumos/_img
for f in docs/insumos/*.docx docs/insumos/*.pptx; do
  markitdown "$f" > "docs/insumos/_md/$(basename "${f%.*}").md" 2>/dev/null \
  || pandoc "$f" -t markdown --wrap=none -o "docs/insumos/_md/$(basename "${f%.*}").md"
done
# imágenes del pitch (pantallas y estilo visual)
unzip -o -q "docs/insumos/Pitch La Dorada 14 de Octubre.pptx" "ppt/media/*" -d docs/insumos/_img
```

Después **mira las imágenes** de `docs/insumos/_img/ppt/media/` con Read (son las pantallas de referencia: marketplace, due diligence, chat, ofertas, alertas, registro, panel de solicitudes, validación, evaluación, etc.). Lee los textos completos antes de planear nada. Las notas de las diapositivas contienen el texto de cada historia.

---

## 2. Reglas del sistema (no negociables — impleméntalas en servidor, no solo en la UI)

1. **Ninguna empresa se publica sin revisión** del Back Office. Enviar información ≠ publicar.
2. **Los documentos reservados no se ven sin NDA firmado + autorización del vendedor.** El control de acceso se aplica en el backend (consultas, URLs de descarga firmadas y de corta duración), nunca solo ocultando elementos.
3. **Ninguna valoración o *score* obliga a comprar o vender.** La valoración es un rango orientativo.
4. **El Back Office valida y supervisa, no decide por las partes**: no acepta ni rechaza ofertas por ellas; comprador y vendedor conservan la decisión económica, jurídica y comercial.
5. El comprador puede **desistir en cualquier etapa**; el expediente termina como `cerrada` o `desistida`.
6. **Trazabilidad total:** bitácora de auditoría append-only de accesos, aprobaciones, firmas, cambios de estado y descargas.
7. La app **no es asesoría financiera regulada ni ejecuta compras automáticas**. Incluye avisos claros en valoración, *score* y ofertas.
8. No se mueve dinero real dentro de la plataforma.

---

## 3. Alcance funcional

**Roles:** Comprador · Vendedor · Back Office (admin). Un mismo usuario no puede ser comprador y vendedor de la misma oportunidad.

**Módulos (de la actividad):** 1) Usuarios y perfiles · 2) Marketplace y oportunidades · 3) Acceso y confidencialidad · 4) Data Room y Due Diligence · 5) Comunicación y colaboración · 6) Ofertas y negociación · 7) Seguimiento y cierre · 8) Administración, cumplimiento y reportes.

**Las 15 historias de usuario** son los criterios de aceptación del producto. Conviértelas en un backlog trazable (`H1…H15`) y haz que **cada historia tenga al menos un test E2E** que la recorra:

| # | Rol | Historia |
|---|---|---|
| H1 | Comprador | Búsqueda y filtros (sector, región, ingresos, EBITDA, tipo), ver valoración/calificación, guardar favoritas |
| H2 | Comprador | Due diligence: Data Room, preguntas y respuestas, avance de la revisión |
| H3 | Comprador | Comunicación: mensajes, reuniones virtuales, intercambio de documentos |
| H4 | Comprador | Ofertas, contrapropuestas, negociación y LOI |
| H5 | Comprador | Alertas y seguimiento de tareas |
| H6 | Vendedor | Registro y acreditación como representante de la empresa |
| H7 | Vendedor | Registro y actualización de información financiera, operativa y general |
| H8 | Vendedor | Definir oportunidad: venta total, venta parcial, inversión/levantamiento de capital, socio estratégico |
| H9 | Vendedor | Separar información pública vs. confidencial |
| H10 | Vendedor | Revisar perfiles y aprobar/rechazar acceso de compradores |
| H11 | Back Office | Validar usuarios: identidad, representación, documentos; pedir correcciones |
| H12 | Back Office | Evaluar empresas: valoración, riesgos, aprobar/rechazar/pedir ajustes y publicar |
| H13 | Back Office | Supervisar NDA, permisos e incumplimientos |
| H14 | Back Office | Seguimiento de transacciones, retrasos e incidencias |
| H15 | Back Office | Indicadores y reportes (usuarios, oportunidades, negociaciones, cierres) |

**Máquinas de estado** (propuesta inicial; valídala en el brainstorming y documéntala con diagramas Mermaid en `docs/`):

- Usuario: `pendiente → en_revisión → correcciones_solicitadas → habilitado | rechazado | bloqueado`
- Oportunidad: `borrador → en_revisión → ajustes_solicitados → aprobada/publicada → suspendida | retirada → cerrada | desistida`
- Acceso: `solicitado → NDA_firmado → autorizado | rechazado → revocado`
- Negociación: `oferta_enviada → contraoferta ⇄ → acuerdo_preliminar → LOI_firmada → due_diligence → cierre | desistimiento`

**Evaluación del Back Office** (ver diapositiva 13): rango de valoración estimado, "calidad de información" (p. ej. 87 % · 26/30 documentos), matriz de evaluación (verificación documental, consistencia financiera, dependencia de clientes, contingencias legales) con estados tipo chip (Completada / Aprobada / Riesgo medio / Por aclarar), y acciones *Solicitar ajustes · Rechazar · Aprobar y publicar*. El *score* debe ser calculado por una función determinista y documentada, no inventada por la UI.

---

## 4. Método de trabajo (obligatorio)

Usa **superpowers** en este orden. No saltes pasos:

1. `superpowers:using-superpowers` al iniciar.
2. `superpowers:brainstorming` — Antes de escribir código. Haz **una sola ronda** de preguntas agrupadas (ver §7) y propón 2–3 alternativas de arquitectura con recomendación.
3. `superpowers:writing-plans` — Plan por fases con tareas pequeñas, independientes y verificables. Guárdalo en `docs/plan/`.
4. `superpowers:using-git-worktrees` — Una rama/worktree por fase o vertical.
5. `superpowers:subagent-driven-development` (y `dispatching-parallel-agents` para tareas independientes) — Ejecuta el plan con subagentes.
6. `superpowers:test-driven-development` — Test primero en lógica de negocio, permisos y máquinas de estado.
7. `superpowers:systematic-debugging` — Ante cualquier fallo, antes de proponer un arreglo.
8. `superpowers:requesting-code-review` — Al cerrar cada fase.
9. `superpowers:verification-before-completion` — **Prohibido decir "listo" sin ejecutar y mostrar la salida** de tests, build y linter.
10. `superpowers:finishing-a-development-branch` — Al integrar cada fase.

### Enrutador de modelos (skill `model-router`)

Carga la skill **`model-router`** al empezar y **antes de cada lanzamiento de subagentes**. Pasa siempre `model` explícito en cada encargo (cada encargo lleva: objetivo en una frase, entradas, formato exacto de salida y criterio de terminado). Asignación sugerida para este proyecto:

| Nivel | Modelo | Úsalo para |
|---|---|---|
| Ligero | `haiku` | Convertir y resumir los insumos, datos *seed* realistas (empresas colombianas ficticias), textos de UI en es-CO, renombrados, formateo, revisión de ortografía, checklists de traza H1–H15 |
| Estándar | `sonnet` | CRUD, componentes y pantallas, endpoints, formularios, migraciones, tests unitarios/E2E, *seed scripts*, depuración habitual |
| Difícil | `opus` | Arquitectura y modelo de datos, **permisos/RBAC y compuerta NDA**, máquinas de estado, cálculo de *score*/valoración, revisión de seguridad, depuración que falló una vez, revisión final de cada fase |
| Máximo | `fable` | **No lo uses** salvo que yo lo pida por nombre |

Reglas: si algo se resuelve con 1–2 llamadas, hazlo tú sin subagente; lanza en **paralelo** lo independiente; si un subagente falla, reintenta con el nivel siguiente. Si la sesión principal está en un modelo más caro de lo necesario, avísame **una sola vez**. Al final de cada fase, dime en una línea qué fue a qué modelo.

---

## 5. Stack y calidad (por defecto; cámbialo solo con justificación breve en un ADR)

- **Web responsive mobile-first** (el pitch muestra laptop + celular) instalable como PWA.
- **Next.js (App Router) + TypeScript estricto + Tailwind + shadcn/ui**.
- **PostgreSQL + Prisma** (migraciones versionadas). Almacenamiento de archivos con interfaz S3-compatible (MinIO/local en dev).
- **Auth** con sesiones seguras, contraseñas con Argon2/bcrypt, 2FA opcional, RBAC por rol **y por oportunidad** (ABAC para NDA/acceso).
- **Integraciones externas detrás de interfaces con implementación simulada** (adaptadores *mock*): KYC/AML, firma electrónica de NDA/LOI, videollamadas, correo/notificaciones. Deja claro en el README cuáles son simulados y cómo enchufar un proveedor real.
- Tiempo real para mensajes y alertas (SSE o WebSockets) con *fallback* razonable.
- **Pruebas:** Vitest (unidad), Playwright (E2E por historia H1–H15 y por permisos), cobertura mínima 80 % en dominio/permisos.
- **Seguridad:** validación con Zod en todos los bordes, límites de tamaño/tipo de archivo, URLs firmadas, rate limiting, cabeceras seguras, sin secretos en el repo, cifrado de datos sensibles, consentimiento de tratamiento de datos (Habeas Data, Ley 1581 de 2012 — marca como "validar con asesor legal").
- **Accesibilidad** WCAG 2.2 AA y rendimiento razonable (Lighthouse ≥ 90 en pantallas clave).
- `docker compose up` debe levantar todo; `npm run seed` y `npm run demo:reset` dejan la app lista para presentar.
- CI (lint, tipos, tests, build).

---

## 6. Diseño y experiencia

Toma como referencia **las imágenes del pitch** (no las copies píxel a píxel; construye un sistema de diseño coherente):

- **Identidad:** logo con triángulo/montañas en dorado-ámbar + wordmark "La Dorada" en azul marino, lema "Empresas con más futuro". Extrae la paleta real de las imágenes: azul marino (títulos, botón primario), dorado/ámbar (acento), blanco y azul muy claro (fondos), y chips semánticos verde/ámbar/rojo para estados.
- **Navegación comprador:** Marketplace · Oportunidades guardadas · Mis procesos · Due Diligence · Ofertas · Alertas.
- **Navegación Back Office:** Inicio · Usuarios · Empresas · Oportunidades · Confidencialidad · Transacciones · Reportes · Configuración.
- Tarjetas de oportunidad con imagen, chip de tipo (Venta total / Venta parcial / Levantamiento de capital / Socio estratégico), métricas (ingresos, EBITDA, crecimiento, margen) y botón "Ver teaser".
- Tarjetas KPI, filtros en barra superior, tablas con chips de estado, vacíos y errores bien diseñados, *skeletons*, modo claro (oscuro opcional).
- Los **teasers** admiten un video corto opcional.
- Textos claros que expliquen **qué es público y qué es confidencial** en cada punto. Cuida lo que "siente" el usuario al registrarse (nota de la actividad): pasos cortos, progreso visible, mensajes de qué falta y por qué.
- Antes de construir pantallas, define tokens y componentes en `docs/design-system.md` y usa la skill `frontend-design`.

---

## 7. Preguntas para el brainstorming (una sola ronda, con tu recomendación por defecto)

1. ¿Despliegue objetivo? (por defecto: local con Docker + guía para Vercel/Railway/Fly)
2. ¿Firma de NDA/LOI: simulada con sello de tiempo + hash del documento, o integrar proveedor real? (por defecto: simulada)
3. ¿Reuniones virtuales: enlace generado (Jitsi/Meet) o solo agendamiento? (por defecto: agendamiento + enlace)
4. ¿KYC/AML: formulario + checklist manual del Back Office? (por defecto: sí, sin proveedor externo)
5. ¿Qué fórmula usar para el *score* y el rango de valoración en la demo? (por defecto: múltiplos de EBITDA/ingresos por sector, parametrizables, claramente marcados como orientativos)
6. ¿Usuarios y empresas de demo: genero 12–15 empresas colombianas ficticias en varios sectores (agroindustria, logística, fintech, etc.)? (por defecto: sí)

Si no respondo, **asume los valores por defecto, regístralos en un ADR y continúa**.

---

## 8. Fases y criterios de aceptación

| Fase | Contenido | Hecho cuando |
|---|---|---|
| **0 Descubrimiento** | Leer insumos, brainstorming, ADRs, matriz de trazabilidad H1–H15 ↔ módulos ↔ pantallas | Plan aprobado en `docs/plan/` |
| **1 Fundaciones** | Repo, CI, Docker, sistema de diseño, esquema de datos, auth, RBAC, bitácora de auditoría, seed | Login por rol funciona; tests de permisos en verde |
| **2 Alta y validación** | H6, H11 (registro, acreditación, cola de revisión del Back Office, correcciones) | Un usuario nuevo recorre alta → habilitado |
| **3 Empresa y publicación** | H7, H8, H9, H12 (expediente, tipo de oportunidad, público/confidencial, evaluación, publicar) | Una empresa pasa de borrador a publicada solo vía revisión |
| **4 Marketplace** | H1 (búsqueda, filtros, ficha/teaser, favoritos, comparación) | Filtros combinados correctos con 15+ empresas |
| **5 Acceso y NDA** | H10, H13 (solicitud, NDA, aprobación, revocación, supervisión) | Test que demuestra que **sin NDA+autorización no se obtiene ningún archivo reservado, ni por URL directa** |
| **6 Data Room, DD y comunicación** | H2, H3 | Carga/organización de documentos, Q&A, avance de DD, mensajes y reuniones |
| **7 Ofertas, LOI y cierre** | H4, H14 | Oferta ⇄ contraoferta → LOI → cierre o desistimiento con trazabilidad |
| **8 Alertas y reportes** | H5, H15 | Alertas en tiempo real; dashboards y exportación de reportes |
| **9 Endurecimiento y demo** | Revisión de seguridad (opus), accesibilidad, rendimiento, E2E completo, README, guion de demo | Recorrido completo de demo sin errores desde `demo:reset` |

Al terminar **cada fase**: ejecuta verificación, pide revisión de código, haz un resumen corto (qué se hizo, qué pruebas pasaron, qué decidiste, qué sigue) y **continúa a la siguiente fase sin esperar**, salvo que haya un bloqueo real o una decisión irreversible.

---

## 9. Reglas de trabajo

- No me preguntes cosas triviales: decide, documenta en un ADR corto y sigue.
- Pregúntame solo si algo es irreversible, cambia el alcance o contradice los insumos.
- Si los insumos son ambiguos o se contradicen, **gana el documento "Sistema general"** y deja la duda anotada en `docs/preguntas-abiertas.md`.
- Commits pequeños y frecuentes (Conventional Commits). No hagas push ni abras PR sin que yo lo pida.
- Mantén `README.md`, `docs/arquitectura.md`, `docs/design-system.md` y `docs/trazabilidad.md` al día.
- Nada de datos personales reales: todo dato de demo es ficticio.
- Nunca declares algo "terminado" sin evidencia ejecutada.

---

## 10. Entregable final

1. App corriendo con `docker compose up` + `npm run demo:reset`.
2. Tres cuentas de demo (comprador, vendedor, Back Office) documentadas en el README.
3. Matriz H1–H15 con enlace a pantalla, endpoint y test E2E de cada una.
4. Guion de demo de 15 minutos que recorra el proceso integral.
5. Lista de integraciones simuladas y pasos para pasar a producción.

**Empieza ahora:** carga `using-superpowers` y `model-router`, convierte los insumos, míralos y lanza el brainstorming.
