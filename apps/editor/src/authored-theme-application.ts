import { parseFrontMatter, replaceFrontMatterValue } from '@markdown/document-core';
import { compileAuthoredTheme } from '@markdown/theme-engine';

/** Apply a validated snapshot without changing report text or other metadata. */
export function applyAuthoredThemeToMarkdown(source: string, input: unknown) {
  const parsed = parseFrontMatter(source);
  if (!parsed.valid) return { updated: false, source, diagnostics: parsed.diagnostics };
  const compiled = compileAuthoredTheme(input);
  if (!compiled.snapshot) return {
    updated: false, source,
    diagnostics: compiled.errors.map(message => ({code:'theme.authored-invalid', message, severity:'error' as const})),
  };
  return replaceFrontMatterValue(source, ['lmx', 'authoredTheme'], compiled.snapshot);
}
