import type { MathInsertion, MathTabStop } from './math-templates.js';

export interface MathSlashTrigger {
  from: number;
  to: number;
  query: string;
}

export interface AppliedMathInsertion {
  text: string;
  tabStops: MathTabStop[];
  activeTabStop: MathTabStop | null;
}

export function findMathSlashTrigger(text: string, caretOffset: number): MathSlashTrigger | null {
  if (!Number.isInteger(caretOffset) || caretOffset < 0 || caretOffset > text.length) return null;
  const beforeCaret = text.slice(0, caretOffset);
  // An alias may contain spaces (including contenteditable's non-breaking
  // spaces), but cannot start with one or cross a line/another slash.
  const match = /(^|[\s([{])\/((?:[^\s/](?:[^\s/]|[ \u00a0])*)?)$/u.exec(beforeCaret);
  if (!match) return null;
  const from = caretOffset - match[0].length + match[1].length;
  return { from, to: caretOffset, query: match[2] ?? '' };
}

export function applyMathInsertion(
  text: string,
  from: number,
  to: number,
  insertion: MathInsertion,
): AppliedMathInsertion {
  const safeFrom = Math.max(0, Math.min(from, text.length));
  const safeTo = Math.max(safeFrom, Math.min(to, text.length));
  const prefix = text.slice(0, safeFrom);
  const suffix = text.slice(safeTo);
  const offset = prefix.length;
  const tabStops = insertion.tabStops.map((tabStop) => ({
    from: offset + tabStop.from,
    to: offset + tabStop.to,
  }));
  const activeTabStop = insertion.activeTabStop
    ? {
        from: offset + insertion.activeTabStop.from,
        to: offset + insertion.activeTabStop.to,
      }
    : null;
  return {
    text: `${prefix}${insertion.text}${suffix}`,
    tabStops,
    activeTabStop,
  };
}

export function moveMathTabStop(
  tabStops: readonly MathTabStop[],
  index: number,
  direction: 'next' | 'previous',
): { index: number; tabStop: MathTabStop } | null {
  if (tabStops.length === 0) return null;
  const delta = direction === 'next' ? 1 : -1;
  const nextIndex = (index + delta + tabStops.length) % tabStops.length;
  const tabStop = tabStops[nextIndex];
  return tabStop ? { index: nextIndex, tabStop } : null;
}
