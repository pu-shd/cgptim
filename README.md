# cgptim

**Your conversations, continued.** A local-first viewer for ChatGPT data exports, with selective conversation downloads for use as attachments in a new chat.

[Open the app](https://pu-shd.github.io/cgptim/) · [User guide](docs/USER_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md)

## What you can do

- Open an export ZIP, multiple extracted JSON files, or a previously exported cgptim JSON slice.
- Search titles and messages, filter starred or archived conversations, and sort your history.
- Read Markdown, tables, and code in a conversation layout. Switch between original conversation branches.
- Select individual messages, a numbered range, or the last ten messages. Add a handoff note.
- Review the exact contents before downloading Markdown or portable JSON. Download marked conversations as a ZIP.
- Inspect account settings, shared conversation records, library records, manifests, and other related JSON separately.

Files are processed in this browser tab. There is no upload endpoint, analytics, account connection, API key, or browser storage. Markdown images and embedded media are blocked. The app does not restore conversations into an account: attach a transcript to a new chat to provide historical context. Original media files must be supplied separately.

The visual design adapts [PrincetonUniversity/StackImages](https://github.com/PrincetonUniversity/StackImages): the same light blue-gray palette, white panels, system fonts, numbered workflow, controls, and inline status messages. ChatGPT-style message blocks and an archive sidebar extend that design. Credits and the upstream MIT license are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Use it

1. Open the app and choose the ZIP from your ChatGPT data export, or `conversations.json` with any related JSON files. Nothing leaves your device.
2. Choose a conversation and branch. Select the messages you want to carry forward.
3. Choose **Review & download**, inspect the transcript, and download it.
4. Attach the `.md` file to a new ChatGPT conversation and paste the provided continuation prompt.

The **Try a sample archive** button uses fictional data. Your own exports are never bundled with this repository.

## Local run and tests with Docker

Install Docker Desktop on macOS, or Docker Engine and Compose on Linux. The commands use `docker-compose`; environments with only `docker compose` can put `.github/bin` on `PATH`.

```sh
docker-compose up --build app
# Open http://127.0.0.1:8080

docker-compose run --build --rm tests
# Explicit lint, format, type, unit, build, and browser test reports.
```

On macOS, equivalent zsh scripts are provided:

```sh
./scripts/build.zsh
./scripts/run.zsh
./scripts/test.zsh
```

No Python environment is needed. TypeScript runs directly in the browser; ZIP decoding and validation run in a Web Worker. This avoids a Pyodide runtime download for a workload that requires no Python packages. All production dependencies are bundled and served from the same origin.

For native Node development (Node 24.13.0 or later):

```sh
npm ci
npx playwright install chromium webkit
npm run dev
# Development server: http://127.0.0.1:5173

npm run check
# Builds and tests the production app; browser tests use port 4173.
```

The development server relaxes only the inline-style CSP directive for Vite's CSS updates. The production build retains the strict CSP. Browser tests always exercise that production build.

## GitHub Pages

The `Validate and deploy Pages` workflow runs the entire suite in Docker for pull requests and main pushes. Only a successful main build can deploy. Pages must use **GitHub Actions** as its source. The output is static, uses relative asset URLs, and works at `/cgptim/` or another directory without a backend.

See [deployment instructions](docs/DEPLOYMENT.md) for setup, updates, rollbacks, self-hosting, and teardown. Container base image versions and npm dependencies are pinned; `package-lock.json` is committed.

## Limits

128 MiB per selected file, 256 MiB total selected files / expanded JSON, 10,000 ZIP entries, 50,000 conversations per conversation file, and 500,000 total message nodes. ZIPs are processed in bounded compressed chunks. Larger exports can be extracted locally and smaller conversation JSON files opened separately. The UI renders 100 conversations/messages at a time with explicit “Show more” buttons.

Related JSON previews are bounded. Unknown multimodal content is labeled rather than silently discarded; original rich payloads remain in your source export. No automatic summary or model-generated continuation is created. ChatGPT's attachment and context limits vary, so use a smaller slice if it cannot read the entire file.

## License

MIT. This independent project is not affiliated with OpenAI.
