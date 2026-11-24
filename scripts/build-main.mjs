import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'html-to-docx'],
  sourcemap: true,
  logLevel: 'info',
};

const options = [
  {
    ...common,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.cjs',
  },
  {
    ...common,
    entryPoints: ['src/main/preload.ts'],
    outfile: 'dist/main/preload.cjs',
  },
];

if (watch) {
  const contexts = await Promise.all(options.map((option) => esbuild.context(option)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(options.map((option) => esbuild.build(option)));
}
