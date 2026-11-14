# Architecture and security

## Static app

Vite builds TypeScript and CSS into `dist/`. No server application, database, migration, cloud credentials, or Python packages are required. A Web Worker reads uploaded `File` objects, decompresses JSON from ZIPs with fflate, validates and normalizes it, and sends a structured archive to the UI. The worker reports progress, supports cancellation through termination, and is stopped after success/error or a two-minute timeout. All import routes are disabled during an import and while an archive is open. Event handlers also reject replacement attempts; clearing the archive re-enables importing, as do cancellation and failure when no archive is loaded.

`src/model.ts` defines the normalized archive and iterative branch traversal. `src/import.ts` is the trust boundary. `src/export.ts` creates Markdown, schema-versioned portable JSON, and batch ZIPs. `src/citations.ts` resolves explicit citation IDs from grouped webpage metadata, direct webpage records, and portable citation records. It validates absolute HTTP(S) URLs, excludes credentials and control characters, and never fetches a source. It converts `genui` and legacy `cite` tokens into numbered links and a source list. A Markdown lexer protects code literals from conversion; nested code whose original location cannot be mapped is preserved conservatively. Missing sources and malformed embedded content receive readable placeholders. `src/render.ts` formats the resulting Markdown with marked and an explicit DOMPurify allowlist. `src/main.ts` controls the UI and in-memory state. Conversation checkboxes select complete visible current paths, independent of the read-only preview pagination. `src/clipboard.ts` applies a 32 KiB UTF-8 limit to Markdown clipboard exports; denied writes fall back to selected review text. Steps 2 and 3 are native disclosure elements, closed before loading data and after clearing it.

Browser-native TypeScript is sufficient for JSON processing. Pyodide would add a Python runtime download without improving the archive workload. The design and local-processing approach follow StackImages; its astronomy engine is not included.

## Supported input

- A ZIP containing JSON at the top level or inside a directory.
- `conversations.json` and numbered `conversations-1.json` / `conversations_1.json` files containing an array, or an object with a `conversations` array.
- Renamed arrays whose first item has a message mapping, or a single object with a mapping.
- cgptim JSON: `format: "cgptim"`, `schemaVersion: 1`, and a `conversations` array of selected, ordered messages.
- Other JSON files as related records, including empty lists and schema shapes unknown to cgptim.

Message trees are validated iteratively. Missing parents are detached with a note. Cycles and malformed nodes invalidate the affected conversation. A missing current node falls back to the last leaf in source mapping order and produces a note. Duplicate conversation IDs are disambiguated for UI use. Non-finite/out-of-range dates become unknown dates. Text strings, text-bearing content parts, common asset pointers, and attachment metadata are preserved as readable context. Unsupported content receives a placeholder. This is a readable slice format, not a lossless archive converter.

## Bounds

Selected files are checked before reading: 128 MiB each and 256 MiB aggregate. Expanded JSON has the same aggregate ceiling. ZIP entry paths cannot be absolute, contain traversal segments, use backslashes, or use drive prefixes. Duplicate ZIP paths are rejected. ZIP files are never extracted to disk. Only JSON entries are decompressed; other entries are inventoried. Streaming inflation counts actual output bytes, including ZIPs with inaccurate size headers. Input chunks are 4 KiB to bound inflater output allocation before checking limits. Encrypted or unsupported compression fails with an inline error.

ZIPs permit up to 10,000 entries. Conversation files permit up to 50,000 conversations; an imported archive permits up to 500,000 message nodes. The main UI initially renders at most 100 conversations and 100 messages. Search indexes titles and visible current-path text in memory. Related-data previews have depth, entry, node, and string limits. Import notes are deduplicated and capped at 100 before general media/file notices.

These limits reduce accidental exhaustion; they are not a claim of constant memory. JSON.parse and structured cloning require additional allocations. Search, rendering very long individual messages, and exporting large slices can still be expensive. Importing is isolated in a worker; rendering and export packaging happen on the main thread. Export fewer conversations on memory-constrained devices.

## Privacy and rendering

There is no fetch of uploaded content, server endpoint, telemetry, remote font, IndexedDB, localStorage, sessionStorage, cookie, or service worker. All runtime dependencies are bundled. Browser page/asset requests still reach the static host; a user clicking a hyperlink makes a normal navigation. Hosting providers can log normal page access. The export data is not in a URL or request body.

The production Content Security Policy restricts scripts, workers, styles, and connections to the same origin, blocks objects and frames, and disallows forms. DOMPurify admits only a small set of formatting tags and link attributes. Markdown image syntax becomes a text label. HTML media, styles, SVGs, event attributes, and scripts are removed. Rendered links use `noopener noreferrer` and a new tab. Source titles, paths, roles, and related JSON use text or HTML escaping. Source `index.html` is never inserted or executed.

A static page cannot protect users from a compromised host, malicious browser extension, or modified dependency. Host a reviewed build locally for sensitive exports. Clearing the app discards references; it does not guarantee forensic erasure from browser memory. Only synthetic fixtures belong in source, screenshots, traces, CI, and bug reports.

## Portable schema

Version 1 has top-level `format`, `schemaVersion`, `exportedAt`, `purpose`, and `conversations`. Each conversation includes identifiers, title/dates, source branch, selected/source message counts, note, and messages. Each message includes `id`, `role`, `text`, `time`, `hidden`, and `attachments`. An optional `citations` array stores validated source `ref`, `title`, and `url` values; old version-1 files without it remain supported. Original message text is retained even when readable Markdown converts citation markers. Slices can have gaps; on reopening, selected messages form a new linear path in their exported order. Original IDs remain in the JSON but generated local node IDs prevent collisions during reopening. Unknown future schema versions fail explicitly.

The UI exports all normalized visible messages on each selected conversation's current path. Internal serialization helpers also support previously created partial slices. Related records, skipped branches, raw metadata, media bytes, and account settings are excluded. Markdown contains human-readable omission and media notices. Source messages may themselves contain instructions; the continuation prompt tells the next model to treat these as historical content until the user confirms applicability.

## Verification

`npm run check` runs ESLint, Prettier, TypeScript, verbose Vitest unit tests, the production build, and Playwright checks. Playwright runs Chromium, WebKit, and mobile WebKit. Browser tests verify initial disclosure state and keyboard toggling, whole-conversation selection, multi-conversation Markdown/JSON/ZIP exports, complete exports beyond the preview's pagination, worker imports, related data, validation failures, clipboard success and denial, large-output clipboard gating, remote-media/script blocking, keyboard tabs, viewport fit, readable citations, source-link security, portable citation round-trips, and literal Python code containing citation syntax. Unit tests cover graph edge cases, malformed inputs, path validation, archive limits, multimodal references, full current-path packaging, portable schema validation, and the clipboard's exact UTF-8 byte boundary.

The Docker test target installs the locked dependencies and matching browser binaries. CI runs the same suite and then packages the static build for Pages. There are no live ChatGPT API tests or account automation.
