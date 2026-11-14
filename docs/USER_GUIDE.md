# User guide

## Open your export

In an eligible ChatGPT account, use **Settings → Data controls → Export data**. Download the export ZIP when it is ready. See [OpenAI's export instructions](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data) for current availability and details.

Choose the ZIP in cgptim, or extract it and select `conversations.json` alongside `user_settings.json`, `user.json`, `shared_conversations.json`, `library_files.json`, `export_manifest.json`, and other JSON files you want to inspect. You can also drop files on the import area. Choosing new files replaces the currently opened archive after validation succeeds. A failed import keeps your previous archive available.

An HTML-only export is not supported. Exported HTML is never executed. Non-JSON files inside a ZIP appear in the file inventory but are not rendered. Folder upload is not required; selecting the original ZIP is easiest.

**Cancel import** stops the worker. **Clear archive** removes loaded conversations, related data, selections, notes, and previews from the app. Reloading or closing the tab also discards them. Downloaded files remain on your device. This is not a secure memory-erasure guarantee for the browser or operating system.

## Find and read a conversation

Search matches titles and message text across every branch, including hidden/system/tool messages. A match can be on a different branch from the one currently displayed. Choose that conversation and switch branches if the matching text is not visible. Starred and archived filters use the flags in the source export. Sort by update date, creation date, or title.

The current path is the chain ending at the export's `current_node`. Alternate leaves appear in the branch menu. Shared ancestors appear on each corresponding path. Branches follow parent pointers, even when the export does not contain `children` arrays. Missing parents create a partial history with an import note. Cycles cause the affected conversation to be skipped with an explanation.

Only visible user and assistant messages are shown by default. The **Show system, tool & hidden messages** checkbox reveals additional source content. Changing this setting or changing branches selects all messages on the resulting path; review your selection again before downloading.

Markdown is formatted locally. Embedded images, scripts, HTML media, forms, and frames are blocked. External hyperlinks open in a new tab only when clicked. Image/audio/video references appear as text placeholders. This version does not play recordings, display original images, resolve citation markers, or restore source attachments.

## Slice and export

Each visible message has an inclusion checkbox. Use **Select all**, **Clear selection**, **Last 10**, or **Select a message range** for larger histories. Numbers refer to the current branch and visibility setting. Selected messages preserve their original order, even if you leave gaps. The transcript explicitly states that unselected messages and branches are omitted.

A handoff note is text you write yourself, such as a reminder of the next task or a changed constraint. It is included in both download formats.

**Markdown** is the recommended attachment format. It contains the title, dates, an omission notice, continuation instructions, your note, selected message text, and attachment references. It excludes account settings and other conversations.

**Portable JSON** stores the same selected messages with structured roles, timestamps, IDs, and attachment references. It can be opened again in cgptim. It is a cgptim format, not an official ChatGPT import format. It does not preserve the source export's unselected nodes, raw metadata, or entire branch tree.

**Review & download** shows the exact file contents. Read it before sharing. A transcript can contain private data or historical instructions. Selecting fewer messages is the primary way to reduce its contents; for text-level redaction, edit the downloaded file locally before uploading it.

For a batch ZIP, mark conversations in the sidebar. Each visited conversation uses its most recent branch, message selection, and note. Selections persist while you move between conversations in this tab. Unvisited conversations use their current path and visible user/assistant messages, with any note from a reopened portable slice. Marking a conversation does not automatically export all its alternate branches. The ZIP includes a separate Markdown/JSON pair for each included conversation and a README. Empty selections are omitted. You can prepare a different slice for each marked conversation before downloading the ZIP.

## Continue in ChatGPT

1. Start a new conversation in the destination account.
2. Attach the downloaded `.md` file. Use the `.json` only if you prefer its structured form. The two files represent the same slice, so attach one format.
3. Paste the continuation prompt shown in cgptim, and describe what you want to do next.
4. Upload any original images, documents, or other files needed for that task separately.

The model receives historical context through the attachment. Its context window and file-processing behavior still apply. This does not recreate sidebar history, transfer saved memory, configure custom instructions, or restore projects. If a transcript is too large, return to cgptim and select a smaller range. The app shows file bytes, not a model-specific token estimate.

## Related data

The **Archive data** tab displays structured key/value records from other JSON files. Nested lists and objects can be expanded. Previews show at most 200 entries per object/list, 12 levels of nesting, 1,000 total nodes, and 4,000 characters per string. **Download this JSON** saves the entire selected JSON document, including fields that may be hidden by preview limits.

These files may contain account information and are never automatically included in conversation exports. The file inventory lists up to 1,000 source paths. Paths and raw text are rendered as text, never as executable HTML.

## Troubleshooting

- **Invalid JSON:** choose the original JSON file or a fresh export. cgptim does not repair truncated JSON.
- **No supported data:** select the ZIP or conversation JSON, rather than `index.html`.
- **Memory or file limit:** extract the ZIP locally and open smaller JSON files. The app's limits are deliberate; browser memory use can exceed source-file size.
- **Import notes:** expand the notes below the import area. Valid conversations may still load when another conversation is malformed.
- **Missing branch content:** change the branch or reveal hidden messages. Unknown content is labeled. Check the original export for full fidelity.
- **Clipboard unavailable:** the app selects the continuation prompt so you can copy it using the browser's Copy command.
- **Reader cannot start:** use HTTPS or a local HTTP server. Opening `index.html` with a `file://` URL does not support module workers reliably.
