export function registerPluginSet<T>(use: (plugin: T) => void, plugins: readonly T[]): void {
  plugins.forEach((plugin) => use(plugin));
}
