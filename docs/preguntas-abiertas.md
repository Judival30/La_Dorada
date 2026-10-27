# Preguntas abiertas

Preguntas que la especificación o el prompt dejan sin resolver. Cada una tiene una decisión provisional que el proyecto sigue hasta que se confirme con el usuario.

| # | Pregunta | Decisión provisional | Fuente |
|---|---|---|---|
| 1 | La valoración del pitch (COP 180.000–320.000 M con ingresos de COP 12.000 M) es incoherente con los múltiplos por sector. ¿Cuál valor se muestra? | Manda la fórmula de la spec §7 (múltiplos × EBITDA o ingresos, ajuste por crecimiento, redondeo a COP 100 M). El valor del pitch no se usa. | Spec §7 (nota); `docs/insumos` (pitch) |
| 2 | El prompt no define la navegación del vendedor. | Se usa la navegación de la spec §8: Inicio · Mi empresa · Mis oportunidades · Solicitudes de acceso · Data room · Mensajes · Reuniones. | Spec §8 |
| 3 | ¿Puede un comprador acceder a documentos confidenciales si la oportunidad está `SUSPENDED`? | Se bloquea. Solo `PUBLISHED` y `CLOSED` permiten acceso confidencial. La spec §6 no condiciona `canAccessConfidential` al estado de la oportunidad, así que esta regla se añade como decisión provisional. | Spec §6 (sin regla explícita); decisión provisional del brief |
| 4 | ¿Puede desistir el vendedor, además del comprador? | Sí, ambas partes. R5 solo menciona al comprador, pero la máquina de estados del deal permite `withdraw (buyer \| seller)` y la oportunidad permite `withdraw (seller)`. | Spec §2 R5 y §5; "Sistema general" en `docs/insumos` (paso siguiente de desistimiento) |
