import * as esbuild from 'esbuild';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outDir = path.join(__dirname, 'dist');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.error('Building Mindgraph MCP Server with esbuild...');

await esbuild.build({
  entryPoints: [path.join(__dirname, 'server.ts')],
  outfile: path.join(outDir, 'mindgraph-mcp.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  alias: {
    '@': path.join(projectRoot, 'src'),
  },
  // Bundle dependencies into standalone runner except built-in Node packages
  external: [
    'node:*',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.error('Mindgraph MCP server built successfully at mcp/dist/mindgraph-mcp.mjs');
