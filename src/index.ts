import { globSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function readPnpmPatterns(root: string) {
  try {
    const yml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    const parsed = parse(yml) || {};
    return Array.isArray(parsed.packages) ? parsed.packages : [];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        return [];
      }
    }
    throw error;
  }
}

function readPackageJsonPatterns(root: string) {
  try {
    const json = readFileSync(join(root, 'package.json'), 'utf8');
    const parsed = JSON.parse(json) as {
      workspaces?: string[] | { packages?: string[] };
    };
    if (Array.isArray(parsed.workspaces)) {
      return parsed.workspaces;
    }
    if (
      parsed.workspaces &&
      typeof parsed.workspaces === 'object' &&
      Array.isArray(parsed.workspaces.packages)
    ) {
      return parsed.workspaces.packages;
    }
    return [];
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ENOENT') {
        return [];
      }
    }
    throw error;
  }
}

export default function findWorkspaces(root = process.cwd()) {
  const patterns = [
    ...readPnpmPatterns(root),
    ...readPackageJsonPatterns(root),
  ];

  const packages = new Set([root]);
  if (patterns.length === 0) {
    return Array.from(packages);
  }

  const includePatterns = patterns.filter(
    (pattern) => !pattern.startsWith('!'),
  );
  const excludePatterns = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));

  if (includePatterns.length === 0) {
    return Array.from(packages);
  }

  const excluded = new Set<string>();
  for (const pattern of excludePatterns) {
    const variants = new Set([
      pattern,
      pattern.replace(/\/\*\*\/\*$/, ''),
      pattern.replace(/\/\*\*$/, ''),
      pattern.replace(/\/\*$/, ''),
    ]);

    for (const variant of variants) {
      if (!variant) {
        continue;
      }
      for (const match of globSync(variant, { cwd: root })) {
        excluded.add(match);
      }
    }
  }

  const excludeBases = new Set(excluded);

  for (const pkg of globSync(includePatterns, {
    cwd: root,
  })) {
    if (excluded.has(pkg)) {
      continue;
    }
    let isExcluded = false;
    for (const base of excludeBases) {
      if (base && (pkg === base || pkg.startsWith(`${base}/`))) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      continue;
    }
    const path = join(root, pkg);
    try {
      if (statSync(path).isDirectory()) {
        packages.add(path);
      }
    } catch {
      /* empty */
    }
  }

  return Array.from(packages);
}
