export type CitationStyle = 'ieee' | 'apa';

export type CitationEntryType =
  | 'article'
  | 'inproceedings'
  | 'book'
  | 'techreport'
  | 'thesis'
  | 'online'
  | 'misc';

export interface CitationReferenceEntry {
  id: string;
  type?: CitationEntryType;
  author: string;
  title: string;
  year: string;
  venue?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
}

export interface FormattedBibliographyItem {
  id: string;
  index: number;
  label: string;
  authors: string;
  year: string;
  title: string;
  venue: string;
  details: string;
  doiOrUrl: string;
  plainText: string;
}

export interface CrossReferenceTarget {
  id: string;
  kind:
    | 'figure'
    | 'table'
    | 'equation'
    | 'listing'
    | 'algorithm'
    | 'theorem'
    | 'definition'
    | 'property'
    | 'proposition'
    | 'corollary'
    | 'lemma'
    | 'exercise'
    | 'remark';
  number: number;
  prefix: string;
  title?: string;
}

const VALID_ENTRY_TYPES = new Set<CitationEntryType>([
  'article',
  'inproceedings',
  'book',
  'techreport',
  'thesis',
  'online',
  'misc',
]);

export function normalizeCitationStyle(value: unknown): CitationStyle {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'apa') {
    return 'apa';
  }
  return 'ieee';
}

export function readDocumentCitationStyle(data: Record<string, unknown>): CitationStyle {
  const lmx = isRecord(data.lmx) ? data.lmx : {};
  const structure = {
    ...(isRecord(data.structure) ? data.structure : {}),
    ...(isRecord(lmx.structure) ? lmx.structure : {}),
  };
  return normalizeCitationStyle(
    lmx.citationStyle ?? data.citationStyle ?? structure.citationStyle,
  );
}

export function readDocumentReferences(
  data: Record<string, unknown>,
  directiveBodies: readonly string[] = [],
): CitationReferenceEntry[] {
  const lmx = isRecord(data.lmx) ? data.lmx : {};
  const rawList = Array.isArray(lmx.references)
    ? lmx.references
    : Array.isArray(data.references)
      ? data.references
      : [];

  const byId = new Map<string, CitationReferenceEntry>();
  for (const item of rawList) {
    const entry = coerceReferenceEntry(item);
    if (entry) byId.set(entry.id, entry);
  }

  for (const body of directiveBodies) {
    for (const entry of parseReferencesBlockContent(body)) {
      if (!byId.has(entry.id)) {
        byId.set(entry.id, entry);
      }
    }
  }

  return [...byId.values()];
}

export function coerceReferenceEntry(value: unknown): CitationReferenceEntry | null {
  if (!isRecord(value)) return null;
  const id = cleanField(value.id ?? value.key);
  const title = cleanField(value.title);
  if (!id || !title) return null;
  const rawType = cleanField(value.type).toLowerCase() as CitationEntryType;
  const type: CitationEntryType = VALID_ENTRY_TYPES.has(rawType) ? rawType : 'article';
  return {
    id,
    type,
    author: cleanField(value.author) || 'Tác giả',
    title,
    year: cleanField(value.year) || 'n.d.',
    ...(cleanField(value.venue ?? value.journal ?? value.booktitle ?? value.publisher)
      ? { venue: cleanField(value.venue ?? value.journal ?? value.booktitle ?? value.publisher) }
      : {}),
    ...(cleanField(value.volume) ? { volume: cleanField(value.volume) } : {}),
    ...(cleanField(value.issue ?? value.number) ? { issue: cleanField(value.issue ?? value.number) } : {}),
    ...(cleanField(value.pages) ? { pages: cleanField(value.pages) } : {}),
    ...(cleanField(value.doi) ? { doi: cleanField(value.doi) } : {}),
    ...(cleanField(value.url) ? { url: cleanField(value.url) } : {}),
  };
}

/**
 * Parses BibTeX entries (`@article{key, ...}`) and/or markdown reference lines
 * (`- [#key] Author (Year). Title. Venue.`) inside a `:::references` block or
 * BibTeX import string.
 */
export function parseReferencesBlockContent(source: string): CitationReferenceEntry[] {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const entries = new Map<string, CitationReferenceEntry>();

  for (const entry of parseBibtexEntries(trimmed)) {
    entries.set(entry.id, entry);
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const match = /^\s*[-*+]\s+\[(?:@|#)?([A-Za-z0-9:._-]+)\]\s+(.+?)\s*$/u.exec(line);
    if (!match?.[1] || !match[2]) continue;
    const id = match[1];
    if (entries.has(id)) continue;
    const rest = match[2].trim();
    const yearMatch = /\((\d{4}[a-z]?|n\.d\.)\)\.\s*(.+)$/u.exec(rest);
    if (yearMatch) {
      const author = rest.slice(0, yearMatch.index).trim().replace(/[,;]+$/u, '');
      let afterYear = yearMatch[2] ?? '';
      let url = '';
      const urlMatch = /\s+(https?:\/\/\S+)\s*$/u.exec(afterYear);
      if (urlMatch?.[1]) {
        url = urlMatch[1].replace(/\.$/u, '');
        afterYear = afterYear.slice(0, urlMatch.index).trim();
      }
      const dotIndex = afterYear.indexOf('. ');
      const title = (dotIndex >= 0 ? afterYear.slice(0, dotIndex) : afterYear).trim().replace(/\.$/u, '');
      const venue = dotIndex >= 0 ? afterYear.slice(dotIndex + 2).trim().replace(/\.$/u, '') : '';
      entries.set(id, {
        id,
        type: 'article',
        author: author || 'Tác giả',
        year: yearMatch[1] ?? 'n.d.',
        title: title || rest,
        ...(venue ? { venue } : {}),
        ...(url ? { url } : {}),
      });
    } else {
      entries.set(id, {
        id,
        type: 'misc',
        author: 'Tác giả',
        year: 'n.d.',
        title: rest,
      });
    }
  }

  return [...entries.values()];
}

export function parseBibtexEntries(bibtex: string): CitationReferenceEntry[] {
  const results: CitationReferenceEntry[] = [];
  const entryPattern = /@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n\s*@[A-Za-z]+\s*\{|$)/gu;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(bibtex)) !== null) {
    const rawKind = (match[1] ?? '').toLowerCase();
    const id = (match[2] ?? '').trim();
    const body = match[3] ?? '';
    if (!id || rawKind === 'comment' || rawKind === 'preamble' || rawKind === 'string') {
      continue;
    }
    const fields = parseBibtexFields(body);
    const title = cleanBibtexValue(fields.get('title') ?? '');
    if (!title) continue;
    const author = cleanBibtexValue(fields.get('author') ?? fields.get('editor') ?? 'Tác giả');
    const year = cleanBibtexValue(fields.get('year') ?? fields.get('date') ?? 'n.d.').slice(0, 4) || 'n.d.';
    const venue = cleanBibtexValue(
      fields.get('journal')
      ?? fields.get('journaltitle')
      ?? fields.get('booktitle')
      ?? fields.get('publisher')
      ?? fields.get('institution')
      ?? fields.get('school')
      ?? '',
    );
    const volume = cleanBibtexValue(fields.get('volume') ?? '');
    const issue = cleanBibtexValue(fields.get('number') ?? fields.get('issue') ?? '');
    const pages = cleanBibtexValue(fields.get('pages') ?? '').replace(/--+/gu, '-');
    const doi = cleanBibtexValue(fields.get('doi') ?? '');
    const url = cleanBibtexValue(fields.get('url') ?? '');

    const type: CitationEntryType = rawKind === 'inproceedings' || rawKind === 'conference'
      ? 'inproceedings'
      : rawKind === 'book' || rawKind === 'inbook'
        ? 'book'
        : rawKind === 'techreport' || rawKind === 'report'
          ? 'techreport'
          : rawKind === 'phdthesis' || rawKind === 'mastersthesis' || rawKind === 'thesis'
            ? 'thesis'
            : rawKind === 'online' || rawKind === 'electronic' || rawKind === 'webpage'
              ? 'online'
              : rawKind === 'article'
                ? 'article'
                : 'misc';

    results.push({
      id,
      type,
      author: author || 'Tác giả',
      title,
      year,
      ...(venue ? { venue } : {}),
      ...(volume ? { volume } : {}),
      ...(issue ? { issue } : {}),
      ...(pages ? { pages } : {}),
      ...(doi ? { doi } : {}),
      ...(url ? { url } : {}),
    });
  }

  return results;
}

function parseBibtexFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  let index = 0;
  const length = body.length;

  while (index < length) {
    while (index < length && /[\s,}]/u.test(body[index]!)) index += 1;
    if (index >= length) break;

    const keyMatch = /^[A-Za-z_][A-Za-z0-9_:-]*/u.exec(body.slice(index));
    if (!keyMatch) {
      index += 1;
      continue;
    }
    const key = keyMatch[0].toLowerCase();
    index += keyMatch[0].length;

    while (index < length && /\s/u.test(body[index]!)) index += 1;
    if (body[index] !== '=') continue;
    index += 1;
    while (index < length && /\s/u.test(body[index]!)) index += 1;
    if (index >= length) break;

    const startChar = body[index];
    if (startChar === '{') {
      let depth = 1;
      index += 1;
      const valueStart = index;
      while (index < length && depth > 0) {
        if (body[index] === '{') depth += 1;
        else if (body[index] === '}') depth -= 1;
        index += 1;
      }
      fields.set(key, body.slice(valueStart, Math.max(valueStart, index - 1)));
    } else if (startChar === '"') {
      index += 1;
      const valueStart = index;
      while (index < length && !(body[index] === '"' && body[index - 1] !== '\\')) {
        index += 1;
      }
      fields.set(key, body.slice(valueStart, index));
      if (index < length) index += 1;
    } else {
      const valueStart = index;
      while (index < length && body[index] !== ',' && body[index] !== '\n' && body[index] !== '}') {
        index += 1;
      }
      fields.set(key, body.slice(valueStart, index).trim());
    }
  }

  return fields;
}

function cleanBibtexValue(raw: string): string {
  return raw
    .replace(/[{}]/gu, '')
    .replace(/\\&/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function splitAuthors(authorField: string): string[] {
  const trimmed = authorField.trim();
  if (!trimmed) return ['Tác giả'];
  if (/\band\b/iu.test(trimmed)) {
    return trimmed
      .split(/\s+and\s+/iu)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (trimmed.includes(';')) {
    return trimmed
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

function authorSurname(author: string): string {
  const cleaned = author.trim();
  if (!cleaned) return 'Tác giả';
  if (cleaned.includes(',')) {
    return cleaned.split(',')[0]!.trim();
  }
  const parts = cleaned.split(/\s+/u);
  return parts.at(-1) ?? cleaned;
}

function formatAuthorIeee(author: string): string {
  const cleaned = author.trim();
  if (!cleaned) return 'Tác giả';
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((part) => part.trim());
    if (!first) return last || cleaned;
    const initials = first
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `${token[0]!.toUpperCase()}.`)
      .join(' ');
    return `${initials} ${last}`.trim();
  }
  const parts = cleaned.split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return cleaned;
  const last = parts.at(-1)!;
  const initials = parts
    .slice(0, -1)
    .map((token) => `${token[0]!.toUpperCase()}.`)
    .join(' ');
  return `${initials} ${last}`;
}

function formatAuthorApa(author: string): string {
  const cleaned = author.trim();
  if (!cleaned) return 'Tác giả';
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((part) => part.trim());
    if (!first) return last || cleaned;
    const initials = first
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `${token[0]!.toUpperCase()}.`)
      .join(' ');
    return `${last}, ${initials}`.trim();
  }
  const parts = cleaned.split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return cleaned;
  const last = parts.at(-1)!;
  const initials = parts
    .slice(0, -1)
    .map((token) => `${token[0]!.toUpperCase()}.`)
    .join(' ');
  return `${last}, ${initials}`;
}

export function formatAuthorsForBibliography(authorField: string, style: CitationStyle): string {
  const authors = splitAuthors(authorField);
  if (style === 'ieee') {
    const formatted = authors.map(formatAuthorIeee);
    if (formatted.length === 1) return formatted[0]!;
    if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
    if (formatted.length > 6) return `${formatted[0]} et al.`;
    return `${formatted.slice(0, -1).join(', ')}, and ${formatted.at(-1)}`;
  }
  const formatted = authors.map(formatAuthorApa);
  if (formatted.length === 1) return formatted[0]!;
  if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')}, & ${formatted.at(-1)}`;
}

export function formatAuthorInlineApa(authorField: string): string {
  const authors = splitAuthors(authorField).map(authorSurname);
  if (authors.length === 1) return authors[0]!;
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return `${authors[0]} et al.`;
}

export function orderBibliographyEntries(
  entries: readonly CitationReferenceEntry[],
  style: CitationStyle,
  citedKeysInOrder: readonly string[] = [],
): CitationReferenceEntry[] {
  if (style === 'apa') {
    return [...entries].sort((left, right) => (
      authorSurname(splitAuthors(left.author)[0] ?? left.author)
        .localeCompare(authorSurname(splitAuthors(right.author)[0] ?? right.author), 'vi')
      || left.year.localeCompare(right.year)
      || left.title.localeCompare(right.title, 'vi')
    ));
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ordered: CitationReferenceEntry[] = [];
  const seen = new Set<string>();
  for (const key of citedKeysInOrder) {
    const entry = byId.get(key);
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id);
      ordered.push(entry);
    }
  }
  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      ordered.push(entry);
    }
  }
  return ordered;
}

export function formatBibliographyItems(
  entries: readonly CitationReferenceEntry[],
  style: CitationStyle,
  citedKeysInOrder: readonly string[] = [],
): FormattedBibliographyItem[] {
  const ordered = orderBibliographyEntries(entries, style, citedKeysInOrder);
  return ordered.map((entry, idx) => {
    const index = idx + 1;
    const authors = formatAuthorsForBibliography(entry.author, style);
    const venue = entry.venue?.trim() ?? '';
    const detailParts: string[] = [];
    if (style === 'ieee') {
      if (entry.volume) detailParts.push(`vol. ${entry.volume}`);
      if (entry.issue) detailParts.push(`no. ${entry.issue}`);
      if (entry.pages) detailParts.push(`pp. ${entry.pages}`);
    } else {
      if (entry.volume) {
        detailParts.push(entry.issue ? `${entry.volume}(${entry.issue})` : entry.volume);
      }
      if (entry.pages) detailParts.push(entry.pages);
    }
    const details = detailParts.join(', ');
    const doiOrUrl = entry.doi
      ? entry.doi.startsWith('http') ? entry.doi : `https://doi.org/${entry.doi.replace(/^doi:\s*/iu, '')}`
      : entry.url ?? '';

    const label = style === 'ieee' ? `[${index}]` : '';
    const plainText = style === 'ieee'
      ? [
        `${authors}, “${entry.title},”`,
        venue,
        details,
        entry.year,
        doiOrUrl ? `DOI/URL: ${doiOrUrl}` : '',
      ].filter(Boolean).join(' ').replace(/\s+,/gu, ',') + '.'
      : [
        `${authors} (${entry.year || 'n.d.'}).`,
        `${entry.title}.`,
        [venue, details].filter(Boolean).join(', ') + (venue || details ? '.' : ''),
        doiOrUrl,
      ].filter(Boolean).join(' ');

    return {
      id: entry.id,
      index,
      label,
      authors,
      year: entry.year || 'n.d.',
      title: entry.title,
      venue,
      details,
      doiOrUrl,
      plainText,
    };
  });
}

export function extractCitedKeysFromMarkdown(body: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const bracketPattern = /\[(@[A-Za-z0-9_-]+(?:[.:][A-Za-z0-9_-]+)*(?:\s*[;,]\s*@[A-Za-z0-9_-]+(?:[.:][A-Za-z0-9_-]+)*)*)\]/gu;
  let match: RegExpExecArray | null;
  while ((match = bracketPattern.exec(body)) !== null) {
    const inner = match[1] ?? '';
    for (const part of inner.split(/[;,]/u)) {
      const key = part.trim().replace(/^@/u, '');
      if (key && !isCrossReferenceKey(key) && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

const CROSS_REFERENCE_PREFIXES: ReadonlyArray<{
  prefix: string;
  kind: CrossReferenceTarget['kind'];
  label: string;
}> = [
  { prefix: 'fig-', kind: 'figure', label: 'Hình' },
  { prefix: 'tbl-', kind: 'table', label: 'Bảng' },
  { prefix: 'eq-', kind: 'equation', label: 'Phương trình' },
  { prefix: 'lst-', kind: 'listing', label: 'Mã nguồn' },
  { prefix: 'alg-', kind: 'algorithm', label: 'Thuật toán' },
  { prefix: 'thm-', kind: 'theorem', label: 'Định lý' },
  { prefix: 'def-', kind: 'definition', label: 'Định nghĩa' },
  { prefix: 'prop-', kind: 'property', label: 'Tính chất' },
  { prefix: 'proposition-', kind: 'proposition', label: 'Mệnh đề' },
  { prefix: 'cor-', kind: 'corollary', label: 'Hệ quả' },
  { prefix: 'corollary-', kind: 'corollary', label: 'Hệ quả' },
  { prefix: 'lem-', kind: 'lemma', label: 'Bổ đề' },
  { prefix: 'lemma-', kind: 'lemma', label: 'Bổ đề' },
  { prefix: 'exer-', kind: 'exercise', label: 'Bài toán' },
  { prefix: 'exercise-', kind: 'exercise', label: 'Bài toán' },
  { prefix: 'rem-', kind: 'remark', label: 'Nhận xét' },
];

export function isCrossReferenceKey(key: string): boolean {
  const normalized = key.replace(/^@/u, '');
  return CROSS_REFERENCE_PREFIXES.some((item) => normalized.startsWith(item.prefix));
}

export function crossReferenceDisplayPrefix(key: string): string {
  const normalized = key.replace(/^@/u, '');
  const match = CROSS_REFERENCE_PREFIXES.find((item) => normalized.startsWith(item.prefix));
  return match?.label ?? 'Mục';
}

export function formatInlineCitationGroup(
  keys: readonly string[],
  style: CitationStyle,
  entries: readonly CitationReferenceEntry[],
  citedKeysInOrder: readonly string[] = [],
): string {
  const ordered = orderBibliographyEntries(entries, style, citedKeysInOrder);
  const byId = new Map(ordered.map((entry, idx) => [entry.id, { entry, index: idx + 1 }]));
  if (style === 'apa') {
    const parts = keys.map((key) => {
      const found = byId.get(key);
      if (!found) return `${key}, ?`;
      return `${formatAuthorInlineApa(found.entry.author)}, ${found.entry.year || 'n.d.'}`;
    });
    return `(${parts.join('; ')})`;
  }
  const numbers = keys.map((key) => {
    const found = byId.get(key);
    return found ? String(found.index) : `?${key}`;
  });
  return `[${numbers.join(', ')}]`;
}

function cleanField(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
