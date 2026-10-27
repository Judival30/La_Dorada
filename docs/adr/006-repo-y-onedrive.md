# ADR-006: Repositorio propio y worktrees dentro de OneDrive

- Estado: Aceptada
- Fecha: 2026-10-26

## Contexto

El proyecto vive en una carpeta sincronizada con OneDrive. La carpeta padre `C:/Users/judiv` es en sí misma un repositorio git, así que sin un repositorio propio los commits del proyecto se mezclarían con otro historial. Cada milestone se desarrolla en su propio worktree (spec §12).

## Decisión

- `LaDorada/` tiene su propio repositorio git, independiente del repositorio de `C:/Users/judiv`.
- Cada milestone tiene su propio worktree bajo `.claude/worktrees/` (spec §12).
- Los artefactos generados se ignoran en git: `node_modules/`, `.next/`, `.claude/worktrees/` y `.superpowers/` (ver `.gitignore`).

## Consecuencias

- El historial del proyecto es independiente y limpio.
- Los artefactos generados (`node_modules`, `.next`) quedan dentro de la carpeta sincronizada; por eso se ignoran en git.
- Si la sincronización degrada el rendimiento, se propone pausarla o mover el repositorio (spec §14).
