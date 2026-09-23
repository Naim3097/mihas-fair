// The serverless function runs the server's files as Node ES modules, unbundled: an import without its extension, or
// one into a file that has one, does not resolve, and the whole API is down (it happened on 23 September). The rule:
// every runtime import reachable from the function's entry is a relative path ending in .js, to a file that exists,
// and outside server/ and shared/ only content/ (which keeps the same rule) is reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
/** Runtime imports and re-exports of a module, conservatively: only `import type` and `export type` are left out. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?([^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (let m: RegExpExecArray | null; (m = re.exec(src)); ) {
    if (m[2]) continue; // import type / export type: erased. Anything else counts, even a list of types (kept as an empty import under some compilers)
    out.push(m[4]!);
  }
  return out;
}

test('every runtime import the serverless function reaches ends in .js, exists, and stays in server/, shared/ or content/', () => {
  const entry = resolve(root, 'api/index.ts'), seen = new Set<string>(), bad: string[] = [];
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return; seen.add(file);
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) continue; // a package: resolved by Node from node_modules
      const at = `${chain.concat(relative(root, file)).join(' → ')} imports '${spec}'`;
      if (!spec.endsWith('.js')) { bad.push(`${at}: no .js extension`); continue; }
      const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
      if (!existsSync(target)) { bad.push(`${at}: no such file`); continue; }
      const top = relative(root, target).split(/[\\/]/)[0];
      if (!['server', 'shared', 'content'].includes(top!)) { bad.push(`${at}: outside server/, shared/ and content/`); continue; }
      walk(target, chain.concat(relative(root, file)));
    }
  };
  walk(entry, []);
  assert.ok(seen.size > 20, `walked ${seen.size} files`);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the node entry and the live script follow the same rule', () => {
  for (const f of ['server/node.ts', 'server/vercel.ts']) for (const spec of importsOf(resolve(root, f))) if (spec.startsWith('.')) assert.ok(spec.endsWith('.js'), `${f} imports '${spec}'`);
});
