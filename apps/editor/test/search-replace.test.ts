import { describe, expect, it } from 'vitest';
import { findSearchMatches, replaceSearchMatches } from '../src/search-replace';

describe('bounded literal search', () => {
  it('uses UTF-16 offsets, literal punctuation and Unicode case folding', () => {
    expect(findSearchMatches('😀 Toán toán TOÁN', 'toán', false).matches).toEqual([
      { from: 3, to: 7 }, { from: 8, to: 12 }, { from: 13, to: 17 },
    ]);
    expect(findSearchMatches('a.* aX', '.*', true).matches).toEqual([{ from: 1, to: 3 }]);
    expect(findSearchMatches('Toán toán', 'toán', true).matches).toEqual([{ from: 5, to: 9 }]);
  });
  it('never overlaps matches and treats empty search as a no-op', () => {
    expect(findSearchMatches('aaaa', 'aa', true).matches).toEqual([{ from: 0, to: 2 }, { from: 2, to: 4 }]);
    expect(findSearchMatches('abc', '', false).matches).toEqual([]);
  });
  it('keeps original offsets when case-insensitive Unicode matching changes case length', () => {
    const source = 'İ 😀 Toán';
    const result = findSearchMatches(source, 'toán', false);
    expect(result.matches).toEqual([{ from: 5, to: 9 }]);
    expect(replaceSearchMatches(source, result.matches, 'Math').source).toBe('İ 😀 Math');
  });
  it('uses Unicode whole-word boundaries including combining marks and literal metacharacters', () => {
    expect(findSearchMatches('Toán toán họcToán Toán_ Toán2', 'toán', false, true).matches).toEqual([
      { from: 0, to: 4 }, { from: 5, to: 9 },
    ]);
    expect(findSearchMatches('a a\u0301 _a a2', 'a', true, true).matches).toEqual([{ from: 0, to: 1 }]);
    expect(findSearchMatches('(a+)+ .*', '(a+)+', false, true).matches).toEqual([{ from: 0, to: 5 }]);
  });
  it('rejects excessive input and match counts instead of partially replacing', () => {
    expect(findSearchMatches('a'.repeat(2 * 1024 * 1024 + 1), 'a', true).error).toBeTruthy();
    expect(findSearchMatches('a'.repeat(10001), 'a', true).error).toBeTruthy();
    expect(findSearchMatches('x', 'x'.repeat(1025), true).error).toBeTruthy();
  });
  it('checks replacement size and output budget before any write', () => {
    expect(replaceSearchMatches('aaa', [{ from: 0, to: 1 }], 'x'.repeat(16385)).error).toBeTruthy();
    expect(replaceSearchMatches('a'.repeat(1000), Array.from({length:1000}, (_, i) => ({ from:i, to:i+1 })), 'x'.repeat(16384)).error).toBeTruthy();
  });
  it('preserves literal dollar signs, unknown YAML and malformed LMX outside replacements', () => {
    const source = '---\ncustom: keep\n---\n:::theorem\nToán Toán\n';
    expect(replaceSearchMatches(source, [{from: source.indexOf('Toán Toán') + 5, to: source.indexOf('Toán Toán') + 9}], '$&')).toEqual({
      source: '---\ncustom: keep\n---\n:::theorem\nToán $&\n', count: 1, error: null,
    });
  });
});
