export const SEARCH_QUERY_LIMIT = 1024;
export const REPLACEMENT_LIMIT = 16 * 1024;
export const SEARCH_DOCUMENT_LIMIT = 2 * 1024 * 1024;
export const SEARCH_MATCH_LIMIT = 10_000;
export const SEARCH_OUTPUT_LIMIT = 4 * 1024 * 1024;

export interface SearchMatch { from: number; to: number }
export interface SearchResult { matches: SearchMatch[]; error: string | null }

export function findSearchMatches(source: string, query: string, caseSensitive = true, wholeWord = false): SearchResult {
  if (!query) return { matches: [], error: null };
  if (query.length > SEARCH_QUERY_LIMIT) return { matches: [], error: 'Search text is too long.' };
  if (source.length > SEARCH_DOCUMENT_LIMIT) return { matches: [], error: 'This document is too large to search.' };
  // Escape every regex metacharacter: literal search, not user regex.
  // Match the original string so length-changing lowercasing (e.g. İ) cannot
  // corrupt UTF-16 offsets used by CodeMirror replacements.
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(literal, caseSensitive ? 'gu' : 'giu');
  const matches: SearchMatch[] = [];
  for (const match of source.matchAll(pattern)) {
    const from = match.index;
    const to = from + match[0].length;
    if (wholeWord && (
      /[\p{L}\p{N}\p{M}\p{Pc}]$/u.test(source.slice(Math.max(0, from - 2), from))
      || /^[\p{L}\p{N}\p{M}\p{Pc}]/u.test(source.slice(to, to + 2))
    )) continue;
    matches.push({ from, to });
    if (matches.length > SEARCH_MATCH_LIMIT) {
      return { matches: [], error: 'Too many matches. Refine the search.' };
    }
  }
  return { matches, error: null };
}

export function replaceSearchMatches(
  source: string,
  matches: SearchMatch[],
  replacement: string,
): { source: string; count: number; error: string | null } {
  if (replacement.length > REPLACEMENT_LIMIT) return { source, count: 0, error: 'Replacement text is too long.' };
  if (source.length > SEARCH_DOCUMENT_LIMIT) return { source, count: 0, error: 'This document is too large to replace.' };
  if (matches.length > SEARCH_MATCH_LIMIT) return { source, count: 0, error: 'Too many matches. Refine the search.' };
  const ordered = [...matches].sort((a, b) => a.from - b.from);
  if (ordered.some((match, index) => match.from < 0 || match.to < match.from
    || match.to > source.length || (index > 0 && match.from < ordered[index - 1].to))) {
    return { source, count: 0, error: 'Search results are stale. Search again.' };
  }
  const outputLength = source.length + ordered.reduce((total, match) => total + replacement.length - (match.to - match.from), 0);
  if (outputLength > SEARCH_OUTPUT_LIMIT) return { source, count: 0, error: 'Replacement would make the document too large.' };
  let result = '';
  let cursor = 0;
  for (const match of ordered) {
    result += source.slice(cursor, match.from) + replacement;
    cursor = match.to;
  }
  return { source: result + source.slice(cursor), count: ordered.length, error: null };
}
