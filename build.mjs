import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  platform: 'node',
  target: 'es2020',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
};

const pluginDir = 'node_modules/ct-typescript-plugin';
mkdirSync(pluginDir, { recursive: true });
writeFileSync(
  `${pluginDir}/package.json`,
  JSON.stringify({ name: 'ct-typescript-plugin', version: '0.0.1', main: './index.js' }),
);

const pluginConfig = {
  entryPoints: ['typescript-plugin/index.ts'],
  outfile: `${pluginDir}/index.js`,
  bundle: true,
  platform: 'node',
  target: 'es2020',
  format: 'cjs',
  sourcemap: true,
};

if (isWatch) {
  const [ctx1, ctx2] = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(pluginConfig),
  ]);
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(pluginConfig),
  ]);
  console.log('Build complete');
}
