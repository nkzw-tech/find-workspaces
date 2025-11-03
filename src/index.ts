import { globSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export default function findWorkspaces(root = process.cwd()) {
  const yml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const parsed = parse(yml) || {};
  const patterns = Array.isArray(parsed.packages) ? parsed.packages : [];

  const packages = [root];
  for (const pkg of globSync(patterns, {
    cwd: root,
  })) {
    const path = join(root, pkg);
    try {
      if (statSync(path).isDirectory()) {
        packages.push(path);
      }
    } catch {
      /* empty */
    }
  }

  return packages;
}
