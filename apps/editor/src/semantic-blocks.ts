import {
  getLmxInsertCommand,
  getLmxDefinition,
  parseLmx,
  serializeLmxDirective,
  type LmxAttributeValue,
  type LmxDirectiveNode,
} from '@markdown/document-core';

export interface LmxMetadataPatch {
  identifier?: string;
  attributes: Record<string, LmxAttributeValue>;
}

export function insertLmxTemplate(source: string, name: string): string {
  const template = getLmxInsertCommand(name)?.template ?? getLmxDefinition(name)?.template;
  if (!template) return source;
  if (source.length === 0) return template;
  return `${source.trimEnd()}\n\n${template}`;
}

export function insertLmxTemplateAtTrigger(
  source: string,
  commandId: string,
  triggerText: string,
): string {
  const template = getLmxInsertCommand(commandId)?.template;
  if (!template) return source;
  if (!triggerText.trim()) return insertLmxTemplate(source, commandId);
  const escapedTrigger = triggerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const triggerLine = new RegExp(`(^|\\n)${escapedTrigger}(?=\\r?\\n|$)`);
  const match = triggerLine.exec(source);
  if (!match || match.index === undefined) return insertLmxTemplate(source, commandId);

  // A layout break is document-level syntax. If its slash command was typed
  // inside another LMX directive, remove the trigger from that body and place
  // the break immediately after the enclosing directive instead of nesting it.
  if (commandId === 'pagebreak') {
    const triggerStart = match.index + match[1].length;
    const lineNumber = source.slice(0, triggerStart).split(/\r?\n/).length;
    const enclosing = findDeepestContainingDirective(parseLmx(source).directives, lineNumber);
    if (enclosing) {
      const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
      const lines = source.split(/\r?\n/);
      lines.splice(lineNumber - 1, 1);
      const closingLineIndex = Math.max(0, enclosing.endLine - 1 - (enclosing.startLine < lineNumber ? 1 : 0));
      const templateLines = template.trimEnd().split('\n');
      lines.splice(closingLineIndex + 1, 0, '', ...templateLines);
      return lines.join(lineEnding);
    }
  }

  return source.replace(triggerLine, `$1${template.trimEnd()}`);
}

function findDeepestContainingDirective(
  directives: readonly LmxDirectiveNode[],
  lineNumber: number,
): LmxDirectiveNode | undefined {
  for (const directive of directives) {
    if (lineNumber < directive.startLine || lineNumber > directive.endLine) continue;
    return findDeepestContainingDirective(directive.children, lineNumber) ?? directive;
  }
  return undefined;
}

export function updateLmxDirectiveMetadata(
  source: string,
  directiveIndex: number,
  patch: LmxMetadataPatch,
): string {
  const parsed = parseLmx(source);
  const node = parsed.directives[directiveIndex];
  if (!node || !node.raw) return source;
  const updated: LmxDirectiveNode = {
    ...node,
    identifier: patch.identifier?.trim() || undefined,
    attributes: patch.attributes,
  };
  const start = source.indexOf(node.raw);
  if (start === -1) return source;
  return `${source.slice(0, start)}${serializeLmxDirective(updated)}${source.slice(start + node.raw.length)}`;
}
