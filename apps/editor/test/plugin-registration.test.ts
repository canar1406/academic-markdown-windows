import { describe, expect, it } from 'vitest';
import { registerPluginSet } from '../src/plugin-registration.js';

describe('Muya plugin registration', () => {
  it('registers every MarkText UI plugin in the declared order', () => {
    const registered: string[] = [];
    const plugins = ['inline-format', 'front-button', 'front-menu', 'quick-insert'];

    registerPluginSet((plugin) => registered.push(plugin), plugins);

    expect(registered).toEqual(plugins);
  });
});
