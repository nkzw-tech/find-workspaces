import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import findWorkspaces from '../index.js';

function createTempRoot() {
  return mkdtempSync(join(tmpdir(), 'find-workspaces-'));
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function mkdir(path: string) {
  mkdirSync(path, { recursive: true });
}

function sortPaths(paths: string[]) {
  return [...paths].sort();
}

describe('findWorkspaces', () => {
  test('supports pnpm-workspace.yaml patterns', () => {
    const root = createTempRoot();
    try {
      mkdir(join(root, 'packages/pkg-a'));
      mkdir(join(root, 'apps/app-a'));
      writeFileSync(
        join(root, 'pnpm-workspace.yaml'),
        ['packages:', '  - "packages/*"', '  - "apps/*"', ''].join('\n'),
        'utf8',
      );

      const results = findWorkspaces(root);
      expect(sortPaths(results)).toEqual(
        sortPaths([
          root,
          join(root, 'apps/app-a'),
          join(root, 'packages/pkg-a'),
        ]),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('supports package.json workspaces array', () => {
    const root = createTempRoot();
    try {
      mkdir(join(root, 'packages/pkg-a'));
      writeJson(join(root, 'package.json'), {
        name: 'root',
        workspaces: ['packages/*'],
      });

      const results = findWorkspaces(root);
      expect(sortPaths(results)).toEqual(
        sortPaths([root, join(root, 'packages/pkg-a')]),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('supports package.json workspaces object with packages array', () => {
    const root = createTempRoot();
    try {
      mkdir(join(root, 'packages/pkg-a'));
      mkdir(join(root, 'apps/app-a'));
      writeJson(join(root, 'package.json'), {
        name: 'root',
        workspaces: {
          packages: ['packages/*', 'apps/*'],
        },
      });

      const results = findWorkspaces(root);
      expect(sortPaths(results)).toEqual(
        sortPaths([
          root,
          join(root, 'packages/pkg-a'),
          join(root, 'apps/app-a'),
        ]),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('supports glob negation patterns', () => {
    const root = createTempRoot();
    try {
      mkdir(join(root, 'packages/pkg-a'));
      mkdir(join(root, 'packages/excluded/pkg-b'));
      writeJson(join(root, 'package.json'), {
        name: 'root',
        workspaces: ['packages/*', '!packages/excluded/**'],
      });

      const results = findWorkspaces(root);
      expect(sortPaths(results)).toEqual(
        sortPaths([root, join(root, 'packages/pkg-a')]),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('returns only root when no workspaces configured', () => {
    const root = createTempRoot();
    try {
      const results = findWorkspaces(root);
      expect(results).toEqual([root]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  test('unions pnpm and package.json workspace patterns', () => {
    const root = createTempRoot();
    try {
      mkdir(join(root, 'packages/pkg-a'));
      mkdir(join(root, 'apps/app-a'));
      writeFileSync(
        join(root, 'pnpm-workspace.yaml'),
        ['packages:', '  - "packages/*"', ''].join('\n'),
        'utf8',
      );
      writeJson(join(root, 'package.json'), {
        name: 'root',
        workspaces: ['apps/*'],
      });

      const results = findWorkspaces(root);
      expect(sortPaths(results)).toEqual(
        sortPaths([
          root,
          join(root, 'packages/pkg-a'),
          join(root, 'apps/app-a'),
        ]),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
