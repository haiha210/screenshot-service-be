# ESLint & Prettier Configuration

This project uses ESLint for code linting and Prettier for code formatting.

## Installation

ESLint and Prettier are already configured as dev dependencies:

```bash
yarn install
```

## Usage

### Lint code

Check for linting errors:

```bash
yarn lint
```

### Fix linting errors automatically

```bash
yarn lint:fix
```

### Format code

Format all files with Prettier:

```bash
yarn format
```

### Check formatting

Check if files are formatted correctly (useful in CI):

```bash
yarn format:check
```

## Configuration Files

- `.eslintrc.js` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `.eslintignore` - Files to ignore for linting
- `.prettierignore` - Files to ignore for formatting
- `.vscode/settings.json` - VS Code settings for auto-format on save

## Rules

### ESLint

- Uses `eslint:recommended` as base
- Integrates with Prettier
- Allows `console` statements (common in Node.js services)
- Enforces `prefer-const` and `no-var`
- Ignores unused variables starting with `_`

### Prettier

- Single quotes
- Semicolons enabled
- 2 spaces indentation
- 100 character line width
- ES5 trailing commas
- LF line endings

## VS Code Integration

If you're using VS Code, install these extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

The workspace is configured to:

- Format on save
- Auto-fix ESLint errors on save
- Use Prettier as the default formatter

## CI/CD Integration

Add these commands to your CI pipeline:

```bash
# Check linting
yarn lint

# Check formatting
yarn format:check
```

## Pre-commit Hooks (Optional)

To automatically lint and format before committing, you can use `husky` and `lint-staged`:

```bash
yarn add -D husky lint-staged

# Setup husky
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"
```

Create `.lintstagedrc.json`:

```json
{
  "*.js": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"]
}
```

## Troubleshooting

### ESLint errors in Docker

ESLint is a dev dependency and won't be available in production Docker images. This is intentional.

### VS Code not auto-formatting

1. Make sure you have the ESLint and Prettier extensions installed
2. Reload VS Code window: `Cmd/Ctrl + Shift + P` → "Reload Window"
3. Check `.vscode/settings.json` is present

### Conflicting rules

Prettier and ESLint are configured to work together using `eslint-config-prettier`, which disables ESLint formatting rules that conflict with Prettier.
