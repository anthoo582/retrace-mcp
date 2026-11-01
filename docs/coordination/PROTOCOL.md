# Protocolo multi-agente — retrace-mcp

Varias IA trabajan en paralelo sobre este repositorio. Estas reglas existen para que
ninguna sobrescriba el trabajo de otra. Son obligatorias.

## 1. Aislamiento en disco

- Cada agente trabaja en **su propio clon** del repositorio (o su propio `git worktree`).
  Nunca dos agentes en la misma carpeta.
- Cada agente trabaja en **su propia rama** con el prefijo `work/<dominio>`
  (ej. `work/analysis`, `work/core`).
- `master` es **solo integración**. Nadie implementa directamente sobre `master`.

## 2. Propiedad de rutas

- Un archivo tiene **un solo dueño**. La tabla está en `docs/coordination/OWNERSHIP.md`.
- Si necesitás cambiar un archivo de otro dueño: no lo edites. Abrí una nota en
  `docs/coordination/REQUESTS/<fecha>-<de>-<para>-<tema>.md` con el cambio propuesto
  y el diff mínimo. El dueño lo aplica o lo rechaza.
- Los archivos compartidos (`package.json`, `package-lock.json`, `tsconfig.json`,
  `vitest.config.ts`, `contracts/*`) tienen **un dueño único** y se tocan de a uno.

## 3. Ciclo de trabajo

1. `git fetch origin && git rebase origin/master` antes de empezar.
2. Anunciá la tarea en `docs/coordination/TASKS.md` (estado `claimed`, tu rama).
3. Implementá + tests. `npm run typecheck && npm test` (o `pytest`) en verde.
4. Commit pequeño y descriptivo. `git push -u origin work/<dominio>`.
5. Para integrar: PR a `master` o merge con `--rebase`. Nunca `push --force` a `master`.
6. Marcá la tarea `done` en `TASKS.md` con el commit/PR.

## 4. Reglas duras

- Nunca `git push --force` a `master` ni a una rama ajena.
- Nunca reescribir historia ya publicada.
- Nunca commitear credenciales, tokens, ROMs, BIOS, ISOs ni binarios de juegos.
- Nunca borrar archivos de otro dueño.
- Nunca cambiar una interfaz pública (nombre de tool, esquema de entrada, formato de
  respuesta) sin actualizar `contracts/` primero y anotarlo en `DECISIONS.md`.
- Ante conflicto de merge en un archivo ajeno: no lo resuelvas por tu cuenta; pedilo.

## 5. Criterio de "terminado"

Una tarea está terminada solo si: implementación real (sin stubs que devuelvan éxito),
tests que la ejercitan, documentación de la tool y `typecheck`/`test` en verde.
