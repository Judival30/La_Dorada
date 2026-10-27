# ADR-005: Valoración y score como función pura

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

La plataforma muestra un rango de valoración y un score de la empresa, pero no asesora ni obliga a comprar o vender (spec §2 R3, R7). Los valores deben ser reproducibles y revisables por el Back Office (spec §7).

## Decisión

La valoración y el score viven en la función pura `src/domain/valuation.ts`, documentada en `docs/arquitectura.md` (spec §7).

- Rango: último `EBITDA × [mLow, mHigh]` del sector (tabla `Setting`). Si EBITDA ≤ 0, `ingresos × [rLow, rHigh]`.
- Ajuste por crecimiento (CAGR de 3 años): > 15 % → ×1,10; < 0 % → ×0,90.
- Redondeo a COP 100 M.
- Múltiplos iniciales por sector, parametrizables e ilustrativos (spec §7).
- Score 0–100 con pesos parametrizables: calidad de información 30 %, consistencia financiera 25 %, crecimiento 15 %, margen EBITDA 15 %, riesgos 15 % (spec §7).
- El Back Office ve el cálculo desglosado; el comprador ve rango, score y el aviso "Orientativo…".
- Toda vista de valoración, score u oferta incluye `<Disclaimer>` (spec §2 R3).
- Cuando el valor del pitch contradice los múltiplos, manda la fórmula (spec §7; ver `docs/preguntas-abiertas.md`).

## Consecuencias

- Al ser pura, la función se prueba en unidad sin base de datos (spec §11).
- Cambiar múltiplos o pesos no requiere cambiar código, porque se guardan en `Setting`.
- El rango es orientativo y no es una tasación; el aviso es obligatorio en la UI.
- Los múltiplos son ilustrativos y necesitan validación antes de cualquier uso real.
