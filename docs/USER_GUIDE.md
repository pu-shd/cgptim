# User guide

## Open your export

In an eligible ChatGPT account, use **Settings → Data controls → Export data**. Download the export ZIP when it is ready. See [OpenAI's export instructions](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data) for current availability and details.

Choose the ZIP in cgptim, or extract it and select `conversations.json` alongside `user_settings.json`, `user.json`, `shared_conversations.json`, `library_files.json`, `export_manifest.json`, and other JSON files you want to inspect. You can also drop files on the import area. Once an export or sample is open, dropping files, choosing files, and trying the sample are disabled. Use **Clear** before opening anything else. These import routes are also disabled while a file is being read; **Cancel import** makes them available again. A failed import leaves them enabled so you can retry.

An HTML-only export is not supported. Exported HTML is never executed. Non-JSON files inside a ZIP appear in the file inventory but are not rendered. Folder upload is not required; selecting the original ZIP is easiest.

**Cancel import** stops the worker. **Clear** removes loaded conversations, related data, selections and previews from the app. Reloading or closing the tab also discards them. Downloaded files and copied clipboard text remain on your device. This is not a secure memory-erasure guarantee for the browser or operating system.

## Find and read a conversation

The page title is **Chat Export Viewer**. Steps 2 and 3 are collapsed behind disclosure triangles until you open an export or the sample. Loading data opens both sections; **Clear** closes them again. You can also toggle each section manually using its heading or the keyboard.

Search matches titles and visible message text on each conversation's current path. Conversations appear by most recent update. Click a title to read the conversation; use its checkbox to include it in exports. Browsing another conversation does not change your selection.

The read-only preview shows every visible user and assistant message on the current path, initially displaying 100 messages. **Show more messages** expands the preview. Exporting always includes the entire current path, including messages that have not yet been displayed. There are no message checkboxes, range controls, or branch controls.

The current path follows parent links ending at the export's `current_node`. Missing parents create a partial history with an import note; cycles cause the affected conversation to be skipped. Alternate branches and system/tool/hidden messages are omitted from the readable transcript. Check the source export for those records.

Markdown is formatted locally. Embedded images, scripts, HTML media, forms, and frames are blocked. External hyperlinks open only when clicked. Image/audio/video references appear as text placeholders; original media files must be provided separately.

## Select and repackage whole conversations

Use the sidebar checkboxes to select one or more whole conversations. **Select all** includes every conversation matching the current search, including results beyond the first 100 displayed. **Clear selection** unchecks every conversation, including ones hidden by the search. Selections persist while you browse or search within the opened export. Use **Clear** before opening another export; clearing resets the selections.

Step 3 shows the conversation count and combined Markdown size. It offers:

- **Review & download:** inspect the exact combined Markdown or portable JSON before downloading. A single selection uses that conversation's title as its filename; multiple selections use `selected-conversations`.
- **Copy to clipboard:** available for Markdown exports up to 32 KiB in UTF-8, including titles, metadata, and continuation instructions. It copies the same text as the Markdown download. The review dialog also offers copying for short Markdown.
- **Download selected (ZIP):** separate Markdown/JSON pairs for the selected conversations, plus a README. Unselected conversations and related account records are excluded.

If clipboard permission is denied or the Clipboard API is unavailable, the app opens the review, selects the exact Markdown text, and explains how to use the browser's Copy command. Download remains available. Larger Markdown exports use file downloads. The 32 KiB threshold is a conservative app policy, not a model token limit or a guarantee that ChatGPT will accept a paste.

**Portable JSON** retains roles, timestamps, IDs, and attachment references for each exported current path. You can reopen it in cgptim. It is not an official ChatGPT account import format and does not preserve alternate branches, raw metadata, or media bytes. Notes already present in reopened portable files are preserved. Review private content before copying or sharing; edit the downloaded file locally if you need text-level redaction.

## Continue in ChatGPT

1. Start a new conversation in the destination account.
2. Paste the copied Markdown, or attach the downloaded `.md` file. Markdown and JSON represent the same transcript; use one format.
3. Describe what you want to do next. When attaching a file, the provided continuation prompt can help orient the new conversation.
4. Upload any original images, documents, or other files needed for the task separately.

This provides historical context. It does not recreate sidebar history, transfer saved memory, configure custom instructions, or restore projects. ChatGPT's context and attachment limits still apply. If a combined export is too large, select fewer conversations or use the ZIP's separate files. The app reports file bytes, not model-specific tokens.

## Related data

The **Archive data** tab displays structured key/value records from other JSON files. Nested lists and objects can be expanded. Previews show at most 200 entries per object/list, 12 levels of nesting, 1,000 total nodes, and 4,000 characters per string. **Download this JSON** saves the entire selected JSON document, including fields that may be hidden by preview limits.

These files may contain account information and are never automatically included in conversation exports. The file inventory lists up to 1,000 source paths. Paths and raw text are rendered as text, never as executable HTML.

## Troubleshooting

- **Invalid JSON:** choose the original JSON file or a fresh export. cgptim does not repair truncated JSON.
- **No supported data:** select the ZIP or conversation JSON, rather than `index.html`.
- **Memory or file limit:** extract the ZIP locally and open smaller JSON files. The app's limits are deliberate; browser memory use can exceed source-file size.
- **Import notes:** expand the notes below the import area. Valid conversations may still load when another conversation is malformed.
- **Missing branch content:** this simplified viewer uses the current path only. Check the original export for alternate branches or hidden content. Unknown content types are labeled.
- **Clipboard unavailable:** the review selects the Markdown for manual copying. For the continuation prompt, the app selects its text on the page.
- **Reader cannot start:** use HTTPS or a local HTTP server. Opening `index.html` with a `file://` URL does not support module workers reliably.
