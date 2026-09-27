import { expect, it } from 'vitest';
import { getLmxDefinition, parseLmx, serializeLmxDirective, serializeLmxDocument } from '../src/index.js';

it('registers and round-trips a stable authored layout marker, including nested placement and malformed recovery', () => {
  expect(getLmxDefinition('theme-layout')).toMatchObject({ attributes: [{ name: 'node', type: 'string', required: true }] });
  const source = ':::theme-layout {node="section-id"}\n:::\n';
  const parsed = parseLmx(source);
  expect(parsed.diagnostics).toEqual([]);
  expect(serializeLmxDirective(parsed.directives[0]!)).toBe(source);
  expect(parseLmx(`:::style {color="#204060"}\n${source}:::\n`).directives[0]!.children[0]!.attributes.node).toBe('section-id');
  const malformed = ':::theme-layout {node="section-id"}\nNội dung cần giữ nguyên\n';
  expect(parseLmx(malformed).diagnostics[0]!.severity).toBe('error');
  expect(serializeLmxDocument(parseLmx(malformed))).toBe(malformed);
});
