<div align="center">
  <img width="250" src="https://github.com/castastrophe/envoy/blob/main/logo-envoy.png?raw=true">
</div>
<h1 align="center">Envoy</h1>
<p align="center">
  <b>Environment setup, handled.</b>
</p>

<div align="center">

[![Tests][github-image]][github-url]
[![NPM version][npm-image]][npm-url]
[![Coverage][coverage-image]][coverage-url]
[![Conventional Commits][conventional-commits-image]][conventional-commits-url]

</div>

Copy the values you've already stored in `~/.env` into every project's `.env` — automatically, accurately, and without touching secrets you haven't defined.

```sh
yarn dlx @allons-y/envoy
# ✨ Created /your/project/.env
```

## The problem

Every project starts the same way: copy `.env.example` → `.env`, then hunt through Notion, 1Password, Slack history, or your own memory for the actual values. In a monorepo it's worse — five packages, five `.env.example` files, the same ritual repeated for each one.

If you keep a root `~/.env` with your real values (and you should), **envoy bridges the gap**. It reads your `.env.example` as a template, pulls matching keys from `~/.env`, and writes a complete `.env` alongside it — preserving every comment and blank line in the process.

## Features

- **Template-driven** — `.env.example` defines the shape; `~/.env` supplies the values
- **Safe by default** — skips any `.env` that already exists; use `--force` to overwrite
- **Security-first** — will not copy secrets if `.env` is currently tracked by git; warns the user if it isn't included in `.gitignore`
- **Monorepo-aware** — recursively finds every `.env.example` under your project root, skipping `node_modules`
- **Non-destructive** — keys absent from `~/.env` fall back to the example value, so nothing is lost
- **Comment-preserving** — blank lines and `# comments` in `.env.example` are written as-is
- **Preview before you commit** — `--dry-run` shows exactly what would be written without touching the filesystem
- **MCP tool** — expose `copy_env` to any MCP-compatible host (Claude Desktop, Claude Code, etc.)
- **No magic** — the source is small, readable, and fully tested

## Installation

### Prerequisites

Envoy reads from a root `~/.env` file on your machine. If you don't have one yet, create it and add any values you want shared across projects:

```sh
# ~/.env
DATABASE_URL=postgres://localhost:5432/mydb
STRIPE_SECRET_KEY=sk_test_...
OPENAI_API_KEY=sk-...
```

Any key that isn't in `~/.env` will fall back to the value in your `.env.example`, so you can add keys incrementally — you don't need to migrate everything up front.

### Try it without installing

Run envoy once in any project directory without adding it as a dependency:

```sh
yarn dlx @allons-y/envoy
npx @allons-y/envoy
pnpm dlx @allons-y/envoy
bunx @allons-y/envoy
```

### Add to a project

Install as a dev dependency to use envoy in scripts, hooks, or CI:

```sh
yarn add --dev @allons-y/envoy   # Yarn Berry
npm install --save-dev @allons-y/envoy
pnpm add --save-dev @allons-y/envoy
bun add --dev @allons-y/envoy
```

## Usage

### CLI

Run in any project root. Envoy will find every `.env.example` recursively and create the corresponding `.env`.

```sh
envoy
```

| Flag            | Alias | Description                                    |
| --------------- | ----- | ---------------------------------------------- |
| `--force`       | `-f`  | Overwrite existing `.env` files                |
| `--dry-run`     | `-n`  | Preview changes without writing any files      |
| `--root <path>` | `-r`  | Use a custom root env file (default: `~/.env`) |
| `--dir <path>`  | `-d`  | Directory to scan (default: current directory) |
| `--skip-audit`  | `-s`  | Skip the git safety checks                     |
| `--help`        | `-h`  | Show help                                      |

**Examples:**

```sh
# Preview what would be created, without writing anything
envoy --dry-run

# Regenerate .env files from scratch
envoy --force

# Use a team-shared env file instead of ~/.env
envoy --root ./secrets/.env.shared

# Scan a specific directory
envoy --dir packages/api
```

### Security checks

Every time envoy writes a `.env` file it runs two git safety checks automatically:

**1. Git tracking check** — if `.env` is already committed to the repository, envoy refuses to overwrite it and exits with a non-zero code:

```
🚨 Blocked /your/project/.env — this file is tracked by git. Remove it from
   version control before proceeding:
   git rm --cached /your/project/.env
```

Writing secrets into a tracked file would put them one `git push` away from exposure. Envoy will not do this under any circumstances without `--skip-audit`.

**2. Gitignore check** — if `.env` is not covered by any `.gitignore` rule, envoy writes the file but prints a warning:

```
⚠️  /your/project/.env is not covered by .gitignore — add it to prevent
    accidentally committing secrets
```

Both checks use git's own plumbing (`git check-ignore` and `git ls-files`) so nested `.gitignore` files, global ignores, and `.git/info/exclude` are all respected. In directories that aren't git repositories the checks are skipped silently.

Use `--skip-audit` to bypass both checks — for example, in a non-git environment where git isn't available:

```sh
envoy --skip-audit
```

### Postinstall hook

The highest-value place to run envoy is in your project's `postinstall` script. Every contributor who clones the repo and runs their package manager gets a fully populated `.env` automatically — no onboarding doc to follow, no values to track down.

```json
{
	"scripts": {
		"postinstall": "envoy"
	}
}
```

Because envoy skips any `.env` that already exists, running it repeatedly is completely safe. Contributors who already have a `.env` won't have their values touched.

**npm vs Yarn**

Use `postinstall` for this hook regardless of which package manager your project uses. While npm supports a `prepare` lifecycle script that only runs during local development, **Yarn Berry does not support `prepare`** — `postinstall` is the correct choice for both.

**Library authors**

If your package is published to npm, a bare `postinstall` will run for every consumer who installs your package as a dependency — which is not what you want. Use [`pinst`](https://github.com/typicode/pinst) to strip the hook from your published tarball:

```sh
yarn add --dev pinst
```

```json
{
	"scripts": {
		"postinstall": "envoy",
		"prepack": "pinst --disable",
		"postpack": "pinst --enable"
	}
}
```

`pinst --disable` removes `postinstall` from `package.json` before packing, so the published tarball consumers receive contains no hook. `pinst --enable` restores it locally afterward.

### MCP tool

Envoy ships an MCP server so AI tools can call `copy_env` directly. Add it to your host's config:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
	"mcpServers": {
		"envoy": {
			"command": "npx",
			"args": ["-y", "@allons-y/envoy/mcp"]
		}
	}
}
```

**Claude Code** (`.claude/settings.json`):

```json
{
	"mcpServers": {
		"envoy": {
			"command": "npx",
			"args": ["-y", "@allons-y/envoy/mcp"]
		}
	}
}
```

The `copy_env` tool accepts `dir`, `force`, `dry_run`, `root_env_path`, and `skip_audit` — the same options as the CLI.

## How it works

1. Scans `dir` recursively for `.env.example` files (ignoring `node_modules`)
2. For each one, checks whether a `.env` already exists alongside it (skips unless `--force`)
3. Runs git safety checks — blocks if `.env` is tracked; warns if it isn't gitignored
4. Reads `~/.env` (or `--root`) into a key → value map
5. Walks every line in `.env.example`:
    - **Comments and blank lines** are written through unchanged
    - **`KEY=VALUE` lines** where `KEY` exists in `~/.env` get the root value substituted
    - **`KEY=VALUE` lines** where `KEY` is absent fall back to the example value
6. Writes the result to `.env` next to the example file

No network calls. No config files. No global state.

## Requirements

- Node.js >= 24.0.0

## License

[Apache 2.0](./LICENSE) © [Cassondra Roberts](https://allons-y.llc)

[github-image]: https://github.com/castastrophe/envoy/actions/workflows/test.yml/badge.svg?branch=main
[github-url]: https://github.com/castastrophe/envoy/actions/workflows/test.yml
[npm-image]: https://img.shields.io/npm/v/@allons-y/envoy.svg
[npm-url]: https://www.npmjs.com/package/@allons-y/envoy
[conventional-commits-image]: https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg
[conventional-commits-url]: https://conventionalcommits.org/
[coverage-image]: https://img.shields.io/nycrc/castastrophe/envoy
[coverage-url]: https://github.com/castastrophe/envoy/blob/main/.nycrc
