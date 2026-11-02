# Motor de comparacion N64 / PS2

## Objetivo
Decidir si dos funciones son candidatas a equivalencia estructural, sin afirmar semantica.

## Normalizacion
`src/compare/engine.ts` canonicaliza mnemonics de 64 bits sobre su forma de 32:
`daddu->addu`, `daddiu->addiu`, `ld/lq->lw`, `sd/sq->sw`, `beql->beq`, `ldc1->lwc1`, etc.
Cada instruccion produce:
- `shape`: mnemonic + tipos de operando (`REG`, `IMM`, `MEM`, `SYM`).
- `skeleton`: mnemonic + solo tipos (`R`, `I`, `M`, `S`).
- `category`: call, return, branch, load, store, arith, logic, shift, const, float, vector, syscall, nop, other.

## Metricas
- LCS sobre `skeletons` y sobre `categories` (cap 4000 instrucciones).
- Jaccard de trigramas de `skeleton`.
- Similitud de bloques (terminadores, cantidad, tamanos).
- Deltas de llamadas, branches, loads/stores y stack frame.
- Score = 0.5*LCS + 0.2*categorias + 0.2*trigramas + 0.1*bloques.

## Niveles
| Nivel | Condicion |
| --- | --- |
| `exact` | Mnemonics y formas identicas (incluye mnemonics crudos) |
| `structural` | score >= 0.85, 0 deltas de llamadas, <=1 branch, ratio >= 0.8 |
| `probable` | score >= 0.65 y ratio >= 0.5 |
| `unknown` | resto |

El motor devuelve siempre `confirmedEquivalence: false`.

## Confirmacion
Solo `equivalence_record` escribe `level: "confirmed"`. Exige nombre, direccion, evidencia
no vacia, autor y `confirm: true`. El registro se guarda por workspace en
`$RETRACE_DATA_DIR/equivalences/<hash>.json`.

## Limites
- No compara efectos secundarios, memoria ni convenciones ABI reales.
- No normaliza MMI/VU.
- Sin binarios reales, la validacion es sobre fixtures sinteticos.
