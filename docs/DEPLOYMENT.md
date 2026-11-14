# Deployment and maintenance

## GitHub Pages at pu-shd/cgptim

The repository is designed for `https://pu-shd.github.io/cgptim/`.

1. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
2. Ensure Actions is enabled and the `github-pages` environment permits deployments from `main`.
3. Push to `main` or run **Validate and deploy Pages** manually. Pull requests run validation without deployment.
4. Monitor the run through completion. The deploy job depends on successful validation and reports the deployed URL.

The workflow calls `docker-compose` through a small checked-in wrapper for runners that provide the Compose plugin. No extra npm/Python environment or deployment secret is needed. The deploy job receives only `pages: write` and `id-token: write`; other jobs use read-only contents permission.

The generated `dist/` directory contains only the app. User exports must never be added to the repository or site artifact. Do not point the Pages artifact action at the parent export directory.

## Update and rollback

Make focused changes on a branch, run the container suite, review the diff, and merge. Main deploys only after checks pass. Monitor every initiated workflow. To roll back, revert the relevant source commit and let the same validation/deployment workflow run. Do not replace deployed assets by hand.

Dependencies use exact versions plus `package-lock.json`. Update them deliberately, run `npm audit`, and rebuild the container suite. Docker base images use explicit version tags. The transitive minimatch override selects a patched major version; lint checks verify compatibility. Update it alongside typescript-eslint when the override is no longer needed.

To disable the published site, use **Settings → Pages → Unpublish site**. Disable the workflow before making further main pushes if it should stay unpublished. A local Docker teardown is `docker-compose down`; no archive data or database exists in the container.

## Self-host or run locally

```sh
docker-compose up --build app
# http://127.0.0.1:8080

docker-compose down
```

The app container serves static files as an unprivileged user. It uses a read-only filesystem with a temporary `/tmp`, a health check, and a loopback port binding. Change the local port with `CGPTIM_PORT=8090 docker-compose up --build app`. Keep it bound to loopback for local use.

To serve without Docker, run `npm ci && npm run build` and upload the **contents** of `dist/` to a static HTTP/HTTPS host. `npm run preview` serves the build locally. Module workers need HTTP/HTTPS; do not open the HTML directly from disk.

Assets use relative paths by default. An optional `VITE_BASE_PATH` build environment variable can be `./` or an absolute directory path ending in `/`, such as `/cgptim/`. Invalid values fail the build. No environment values are needed at runtime. `example.env` documents the optional settings; copy it to `.env.local` for Vite or export values in the shell. Docker Compose reads shell values or `.env`, not `.env.local`.

The HTML includes a CSP suitable for GitHub Pages, which does not accept custom response headers from the repository. On other hosts, also set `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and the response-header CSP from `nginx.conf` (including `frame-ancestors 'none'`). The project container already does this.

## Development priorities

macOS first, then Linux and web, WSL, Windows, and Android. The zsh scripts are native to macOS and use `set -euo pipefail`. Linux can use Docker Compose directly. This is a browser application; no macOS app signing or notarization and no Azure/GCP infrastructure are required.

For production configuration changes, use the repository review and Pages workflow. The supplied local scripts do not modify production. No script embeds credentials or accepts source archive content as a shell command.
