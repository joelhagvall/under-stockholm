import { plugin } from 'bun';

// Bun has no ESM integration for WebAssembly, which the Rapier package relies on (Vite handles it in the app).
plugin({
  name: 'wasm-esm',
  setup(build) {
    build.onLoad({ filter: /\.wasm$/ }, async ({ path }) => {
      const module = new WebAssembly.Module(await Bun.file(path).arrayBuffer());
      const sources = [...new Set(WebAssembly.Module.imports(module).map((i) => i.module))];
      const names = WebAssembly.Module.exports(module).map((e) => e.name);
      const contents = [
        ...sources.map((s, i) => `import * as import${i} from ${JSON.stringify(s)};`),
        `const bytes = await Bun.file(${JSON.stringify(path)}).arrayBuffer();`,
        `const { instance } = await WebAssembly.instantiate(bytes, { ${sources.map((s, i) => `${JSON.stringify(s)}: import${i}`).join(', ')} });`,
        `export const { ${names.join(', ')} } = instance.exports;`,
      ].join('\n');
      return { contents, loader: 'js' };
    });
  },
});
