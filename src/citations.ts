import { lexer, walkTokens } from 'marked';
import { isRecord, type Citation } from './model';

const referenceId = /^turn\d+[a-z]+\d+$/i;
const markers = () => /\uE200(genui|cite)\uE202([^\uE201]*)\uE201/g;

function safeUrl(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    [...value.trim()].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function refs(value: unknown): string[] {
  if (typeof value === 'string') return referenceId.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(refs);
  if (!isRecord(value)) return [];
  if (typeof value.ref === 'string') return refs(value.ref);
  if (
    Number.isSafeInteger(value.turn_index) &&
    Number(value.turn_index) >= 0 &&
    Number.isSafeInteger(value.ref_index) &&
    Number(value.ref_index) >= 0 &&
    typeof value.ref_type === 'string' &&
    /^[a-z]+$/i.test(value.ref_type)
  ) {
    return [`turn${value.turn_index}${value.ref_type}${value.ref_index}`];
  }
  return [];
}

/** Keep only explicitly mapped citation IDs and safe source metadata, never search snippets. */
export function extractCitations(metadata: unknown): Citation[] {
  if (!isRecord(metadata)) return [];
  const found = new Map<string, Citation>();
  function add(item: unknown, fallback: string[] = []) {
    if (!isRecord(item)) return;
    const url = safeUrl(item.url);
    if (!url) return;
    const ids = [
      ...refs(item.refs),
      ...refs(item.ref),
      ...refs(item.ref_id),
      ...(typeof item.matched_text === 'string'
        ? (item.matched_text.match(/turn\d+[a-z]+\d+/gi) ?? [])
        : []),
      ...fallback,
    ];
    for (const ref of ids)
      if (!found.has(ref))
        found.set(ref, {
          ref,
          url,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title
              : new URL(url).hostname,
        });
  }
  if (Array.isArray(metadata.citations)) for (const item of metadata.citations) add(item);
  if (Array.isArray(metadata.content_references))
    for (const reference of metadata.content_references) {
      if (!isRecord(reference)) continue;
      add(reference);
      if (Array.isArray(reference.items)) {
        const fallback =
          reference.items.length === 1 && typeof reference.alt === 'string'
            ? (reference.alt.match(/turn\d+[a-z]+\d+/gi) ?? [])
            : [];
        for (const item of reference.items) add(item, fallback);
      }
    }
  return [...found.values()];
}

function codeProtection(text: string): { ranges: [number, number][]; quotedMarkers: Set<string> } {
  const ranges: [number, number][] = [];
  const quotedMarkers = new Set<string>();
  walkTokens(lexer(text), (token) => {
    if ((token.type !== 'code' && token.type !== 'codespan') || !token.raw) return;
    let start = text.indexOf(token.raw);
    if (start < 0) {
      // Nested blockquotes/lists may remove indentation from token.raw. Preserve
      // their marker literals conservatively rather than rewriting code examples.
      for (const match of token.raw.matchAll(markers())) quotedMarkers.add(match[0]);
      return;
    }
    while (start >= 0) {
      ranges.push([start, start + token.raw.length]);
      start = text.indexOf(token.raw, start + token.raw.length);
    }
  });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  return { ranges: merged, quotedMarkers };
}

const label = (value: string) =>
  value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]()<>!|]/g, '\\$&');

/** Produce readable Markdown for both the preview and downloads, leaving source text intact. */
export function citationsToMarkdown(source: string, citations: Citation[] = []): string {
  if (!markers().test(source)) return source;
  const text = source.replace(/\r\n?/g, '\n');
  const { ranges, quotedMarkers } = codeProtection(text);
  const byRef = new Map(
    extractCitations({ citations }).map((citation) => [citation.ref, citation]),
  );
  const used = new Map<string, { number: number; citation: Citation }>();
  let rangeIndex = 0;
  const converted = text.replace(
    markers(),
    (raw: string, kind: string, payload: string, offset: number) => {
      while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= offset) rangeIndex++;
      if (
        quotedMarkers.has(raw) ||
        (ranges[rangeIndex] && ranges[rangeIndex][0] <= offset && offset < ranges[rangeIndex][1])
      )
        return raw;
      let ids: string[];
      if (kind === 'genui') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          return '[unsupported embedded content]';
        }
        if (!isRecord(parsed) || !isRecord(parsed.citation))
          return '[unsupported embedded content]';
        ids = [...refs(parsed.citation.ref), ...refs(parsed.citation.refs)];
      } else ids = payload.match(/turn\d+[a-z]+\d+/gi) ?? [];
      if (!ids.length) return '[source unavailable]';
      return [...new Set(ids)]
        .map((id) => {
          const citation = byRef.get(id);
          if (!citation) return '[source unavailable]';
          let entry = used.get(citation.url);
          if (!entry) {
            entry = { number: used.size + 1, citation };
            used.set(citation.url, entry);
          }
          return `[${entry.number}](<${citation.url}>)`;
        })
        .join(' ');
    },
  );
  if (!used.size) return converted;
  return `${converted}\n\n**Sources**\n\n${[...used.values()].map(({ number, citation }) => `- [${number}. ${label(citation.title)}](<${citation.url}>)`).join('\n')}`;
}
