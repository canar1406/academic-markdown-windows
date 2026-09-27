import { describe, expect, it } from 'vitest';
import {
  applyMathInsertion,
  findMathSlashTrigger,
  moveMathTabStop,
} from '../src/math-insertion.js';
import { findMathTemplates } from '../src/math-templates.js';

describe('math insertion helpers', () => {
  it('finds only the slash query immediately before the caret', () => {
    expect(findMathSlashTrigger('x + /he', 7)).toEqual({ from: 4, to: 7, query: 'he' });
    expect(findMathSlashTrigger('x / he', 6)).toBeNull();
  });

  it.each(['trị ', 'trị tuyệt ', 'trị tuyệt đối', 'trị tuyệt đối ', 'trị tuyệt đối   ', 'tri tuyet doi '])(
    'keeps the multi-word query %j open, including trailing spaces',
    (query) => {
      const text = `x + /${query}`;
      expect(findMathSlashTrigger(text, text.length)).toEqual({
        from: 4, to: text.length, query,
      });
      expect(findMathTemplates(query).some((template) => template.id === 'absolute-value')).toBe(true);
    },
  );

  it('replaces the whole Vietnamese alias including its trailing space, without touching the suffix', () => {
    const text = 'x + /trị tuyệt đối  + y';
    const trigger = findMathSlashTrigger(text, 19);
    expect(trigger).toEqual({ from: 4, to: 19, query: 'trị tuyệt đối ' });
    const template = findMathTemplates('trị tuyệt đối ')[0];
    expect(template?.id).toBe('absolute-value');
    if (!trigger || !template) throw new Error('Expected the absolute-value alias');
    expect(applyMathInsertion(text, trigger.from, trigger.to, template.create()).text)
      .toBe('x + \\left|\\right| + y');
  });

  it.each(['a/b', '1/2', 'x / y', 'x / ', '/ ', '/ trị tuyệt đối', '/\t', '/trị\n', '/trị\t', '\\frac{a/b}{c/d}'])(
    'does not open a math command for division or invalid whitespace: %j',
    (text) => expect(findMathSlashTrigger(text, text.length)).toBeNull(),
  );

  it('still opens an empty slash menu and uses only the most recent command', () => {
    expect(findMathSlashTrigger('/', 1)).toEqual({ from: 0, to: 1, query: '' });
    expect(findMathSlashTrigger('/trị /f', 7)).toEqual({ from: 5, to: 7, query: 'f' });
  });

  it('replaces the trigger and shifts tab stops into document offsets', () => {
    expect(applyMathInsertion('x + /f', 4, 6, {
      text: '\\frac{}{}',
      tabStops: [{ from: 6, to: 6 }, { from: 8, to: 8 }],
      activeTabStop: { from: 6, to: 6 },
    })).toEqual({
      text: 'x + \\frac{}{}',
      tabStops: [{ from: 10, to: 10 }, { from: 12, to: 12 }],
      activeTabStop: { from: 10, to: 10 },
    });
  });

  it('moves forward and backward through tab stops', () => {
    const stops = [{ from: 4, to: 5 }, { from: 8, to: 9 }, { from: 12, to: 13 }];
    expect(moveMathTabStop(stops, 0, 'next')).toEqual({ index: 1, tabStop: stops[1] });
    expect(moveMathTabStop(stops, 0, 'previous')).toEqual({ index: 2, tabStop: stops[2] });
  });
});
