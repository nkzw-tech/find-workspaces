import type { Stats } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';

type VfsEntry = { contents: string; type: 'file' } | { type: 'dir' };

class VirtualFs {
  #entries = new Map<string, VfsEntry>();

  reset() {
    this.#entries.clear();
  }

  setDir(path: string) {
    this.#entries.set(path, { type: 'dir' });
  }

  setFile(path: string, contents: string) {
    this.#entries.set(path, { contents, type: 'file' });
  }

  readFileSync(path: string, encoding: string) {
    if (encoding !== 'utf8') {
      throw new Error(`Unsupported encoding in test VFS: ${encoding}`);
    }
    const entry = this.#entries.get(path);
    if (!entry) {
      const error = Object.assign(
        new Error(`ENOENT: no such file or directory, open '${path}'`),
        {
          code: 'ENOENT',
        },
      );
      throw error;
    }
    if (entry.type !== 'file') {
      const error = Object.assign(
        new Error(`EISDIR: illegal operation on a directory, read '${path}'`),
        {
          code: 'EISDIR',
        },
      );
      throw error;
    }
    return entry.contents;
  }

  statSync(path: string) {
    const entry = this.#entries.get(path);
    if (!entry) {
      const error = Object.assign(
        new Error(`ENOENT: no such file or directory, stat '${path}'`),
        {
          code: 'ENOENT',
        },
      );
      throw error;
    }

    const isDirectory = () => entry.type === 'dir';

    return {
      isDirectory,
    } as unknown as Stats;
  }

  globSync(patterns: string[] | string, opts: { cwd: string }) {
    const list = Array.isArray(patterns) ? patterns : [patterns];
    const cwd = opts.cwd;

    const relDirs: string[] = [];
    for (const [path, entry] of this.#entries) {
      if (entry.type !== 'dir') {
        continue;
      }
      if (path === cwd) {
        continue;
      }
      if (!path.startsWith(`${cwd}/`)) {
        continue;
      }
      relDirs.push(path.slice(cwd.length + 1));
    }

    const matches: string[] = [];
    for (const pattern of list) {
      for (const rel of relDirs) {
        if (matchGlob(rel, pattern)) {
          matches.push(rel);
        }
      }
    }

    // Preserve input order; de-dupe.
    return Array.from(new Set(matches));
  }
}

function matchGlob(path: string, pattern: string): boolean {
  const pathParts = path.split('/');
  const patParts = pattern.split('/');

  function matchAt(i: number, j: number): boolean {
    while (true) {
      const pat = patParts[j];
      const part = pathParts[i];

      if (pat === undefined) {
        return i === pathParts.length;
      }

      if (pat === '**') {
        // Try to match the rest of the pattern at any position.
        for (let k = i; k <= pathParts.length; k++) {
          if (matchAt(k, j + 1)) {
            return true;
          }
        }
        return false;
      }

      if (part === undefined) {
        return false;
      }

      if (pat === '*' || pat === part) {
        i++;
        j++;
        continue;
      }

      return false;
    }
  }

  return matchAt(0, 0);
}

const vfs = new VirtualFs();

vi.mock('node:fs', () => {
  return {
    globSync: (patterns: string[] | string, opts: { cwd: string }) =>
      vfs.globSync(patterns, opts),
    readFileSync: (path: string, encoding: string) =>
      vfs.readFileSync(path, encoding),
    statSync: (path: string) => vfs.statSync(path),
  };
});

const { default: findWorkspaces } = await import('../index.js');

function sortPaths(paths: string[]) {
  return [...paths].sort();
}

function yaml(lines: string[]) {
  return `${lines.join('\n')}\n`;
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

describe('findWorkspaces', () => {
  test('supports pnpm-workspace.yaml patterns', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/pkg-a'));
    vfs.setDir(join(root, 'apps/app-a'));
    vfs.setFile(
      join(root, 'pnpm-workspace.yaml'),
      yaml(['packages:', '  - "packages/*"', '  - "apps/*"']),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([root, join(root, 'apps/app-a'), join(root, 'packages/pkg-a')]),
    );
  });

  test('supports package.json workspaces array', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/pkg-a'));
    vfs.setFile(
      join(root, 'package.json'),
      json({ name: 'root', workspaces: ['packages/*'] }),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([root, join(root, 'packages/pkg-a')]),
    );
  });

  test('supports package.json workspaces object with packages array', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/pkg-a'));
    vfs.setDir(join(root, 'apps/app-a'));
    vfs.setFile(
      join(root, 'package.json'),
      json({
        name: 'root',
        workspaces: {
          packages: ['packages/*', 'apps/*'],
        },
      }),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([root, join(root, 'packages/pkg-a'), join(root, 'apps/app-a')]),
    );
  });

  test('supports glob negation patterns', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/pkg-a'));
    vfs.setDir(join(root, 'packages/excluded'));
    vfs.setDir(join(root, 'packages/excluded/pkg-b'));
    vfs.setFile(
      join(root, 'package.json'),
      json({
        name: 'root',
        workspaces: ['packages/*', '!packages/excluded/**'],
      }),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([root, join(root, 'packages/pkg-a')]),
    );
  });

  test('supports negation patterns with mid-path globs', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/app'));
    vfs.setDir(join(root, 'packages/app/fixtures'));
    vfs.setDir(join(root, 'packages/app/fixtures/bar'));
    vfs.setDir(join(root, 'packages/app/keep'));
    vfs.setFile(
      join(root, 'package.json'),
      json({
        name: 'root',
        workspaces: ['packages/**', '!**/fixtures'],
      }),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([
        root,
        join(root, 'packages/app'),
        join(root, 'packages/app/keep'),
      ]),
    );
  });

  test('returns only root when no workspaces configured', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);

    const results = findWorkspaces(root);
    expect(results).toEqual([root]);
  });

  test('unions pnpm and package.json workspace patterns', () => {
    const root = '/repo';
    vfs.reset();
    vfs.setDir(root);
    vfs.setDir(join(root, 'packages/pkg-a'));
    vfs.setDir(join(root, 'apps/app-a'));
    vfs.setFile(
      join(root, 'pnpm-workspace.yaml'),
      yaml(['packages:', '  - "packages/*"']),
    );
    vfs.setFile(
      join(root, 'package.json'),
      json({
        name: 'root',
        workspaces: ['apps/*'],
      }),
    );

    const results = findWorkspaces(root);
    expect(sortPaths(results)).toEqual(
      sortPaths([root, join(root, 'packages/pkg-a'), join(root, 'apps/app-a')]),
    );
  });
});
