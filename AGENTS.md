<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Versionado y releases

Regla del proyecto: **todo cambio de producto que se commitea y pushea debe subir
la version del escritorio y publicar una release**, para que las instalaciones
detecten la actualizacion. Los cambios internos (docs, scripts de tooling,
`.gitignore`, CI) NO suben version.

Por que: el escritorio (electron-updater) compara `apps/desktop/package.json`
contra el `latest.yml` de la ultima GitHub Release; hay un manifiesto de respaldo
en `updates/latest.json` que usan la landing y las apps portable / no instaladas.
La web y la API en modo nube ya se actualizan solas al pushear a `main`, pero se
versionan junto con el escritorio para dejar una release descargable.

Como publicar:

```bash
pnpm release patch --notes-file <ruta.txt>   # o: pnpm release patch --notes "texto"
pnpm release minor                            # o: major, o una version X.Y.Z
pnpm release patch --skip-push                # sube version y commitea, sin publicar
```

El script `scripts/release.mjs` actualiza la version en los 3 lugares
(`apps/desktop/package.json`, `apps/desktop/src/preload.ts`, `updates/latest.json`),
hace `git add -A` + commit, `git push`, y crea/empuja el tag `vX.Y.Z`. El push del
tag dispara `.github/workflows/release.yml`, que compila y publica los instaladores.

En Windows, para evitar problemas de acentos en la consola, usar `--notes-file`
con un archivo UTF-8 en vez de `--notes`.
