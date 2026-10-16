import type { ThemeSceneNode, ThemeSceneV2 } from './index.js';

/** Portable, text-only data bindings. No expression evaluation or path traversal. */
export const authoredBindingKeys = [
  'document.title', 'cover.university', 'cover.school', 'cover.faculty',
  'cover.reportType', 'cover.major', 'cover.supervisor', 'cover.locationDate',
  'cover.students', 'header.institution', 'header.faculty', 'footer.left',
] as const;
export type AuthoredBindingKey = typeof authoredBindingKeys[number];

const allowedKeys = new Set<string>(authoredBindingKeys);
const targets: Record<string, readonly string[]> = {
  text: ['text'], paragraph: ['text'], heading: ['text'],
  header: ['text', 'institution', 'faculty'], footer: ['text', 'left'],
  cover: ['title', 'university', 'school', 'faculty', 'reportType', 'major', 'supervisor', 'locationDate'],
};

export function resolveAuthoredBindings(
  scene: ThemeSceneV2,
  metadata: Record<string, unknown>,
): { scene: ThemeSceneV2; errors: string[] } {
  const errors: string[] = [];
  const declared = new Set<string>();
  for (const definition of scene.bindings) {
    if (!record(definition) || !allowedKeys.has(String(definition.key))
      || definition.valueType !== 'string' || declared.has(String(definition.key))) {
      errors.push('Authored bindings require unique, supported text metadata keys.');
    } else declared.add(String(definition.key));
  }
  const lmx = record(metadata.lmx) ? metadata.lmx : {};
  const group = (key: string): Record<string, unknown> => ({
    ...(record(metadata[key]) ? metadata[key] : {}),
    ...(record(lmx[key]) ? lmx[key] : {}),
  });
  const cover = group('cover'), header = group('header'), footer = group('footer');
  const values: Partial<Record<AuthoredBindingKey, unknown>> = {
    'document.title': cover.title ?? metadata.title,
    'cover.university': cover.university, 'cover.school': cover.school, 'cover.faculty': cover.faculty,
    'cover.reportType': cover.reportType, 'cover.major': cover.major,
    'cover.supervisor': cover.supervisor, 'cover.locationDate': cover.locationDate,
    'header.institution': header.institution, 'header.faculty': header.faculty,
    'footer.left': footer.left,
  };
  if (Array.isArray(cover.students)) {
    if (cover.students.length > 10 || cover.students.some(student => !record(student)
      || (student.name !== undefined && typeof student.name !== 'string')
      || (student.id !== undefined && typeof student.id !== 'string'))) {
      errors.push('The cover.students binding requires at most ten text name/ID pairs.');
    } else if (cover.students.length) {
      values['cover.students'] = cover.students.map((student: Record<string, unknown>) => (
        [student.name, student.id ? `(${student.id})` : ''].filter(Boolean).join(' ')
      )).join('\n');
    }
  }
  const visit = (node: ThemeSceneNode): ThemeSceneNode => {
    const properties = { ...node.properties };
    if (node.bindings !== undefined && !record(node.bindings)) {
      errors.push(`Invalid authored binding map: ${node.id}.`);
    }
    for (const [property, key] of Object.entries(node.bindings ?? {})) {
      if (typeof key !== 'string' || !declared.has(key) || !allowedKeys.has(key)
        || !Object.hasOwn(targets, node.widget) || !targets[node.widget]!.includes(property)) {
        errors.push(`Unsupported authored binding: ${node.id}.${property}.`);
        continue;
      }
      const value = values[key as AuthoredBindingKey];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > 16384 || value.includes('\0')) {
        errors.push(`Authored binding ${key} requires bounded text metadata.`);
      } else properties[property] = value;
    }
    return { ...node, properties, children: node.children.map(visit) };
  };
  return { scene: { ...scene, root: visit(scene.root) }, errors: [...new Set(errors)] };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
