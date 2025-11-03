# `@nkzw/find-workspaces`

Utility to find all workspace package paths in a monorepo setup. Can be used for the `packageDir` setting for the [`import-x/no-extraneous-dependencies`](https://github.com/un-ts/eslint-plugin-import-x/blob/master/docs/rules/no-extraneous-dependencies.md) ESLint rule.

## Installation

```bash
npm install @nkzw/find-workspaces
```

## Usage

```typescript
import findWorkspaces from '@nkzw/@nkzw/find-workspaces';

console.log(findWorkspaces()); // Uses `process.cwd()` by default.

console.log(findWorkspaces('/path/to/your/project'));
```

### Usage with ESLint

```typescript
import findWorkspaces from '@nkzw/@nkzw/find-workspaces';

export default [
  {
    rules: {
      'import-x/no-extraneous-dependencies': [
        2,
        { packageDir: findWorkspaces() },
      ],
    },
  },
];
```
