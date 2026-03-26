# @allons-y/envoy

**Environment setup, handled.**

> Copy the values you've already stored in `~/.env` into every project's `.env` — automatically, accurately, and without touching secrets you haven't defined.

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
- **Monorepo-aware** — recursively finds every `.env.example` under your project root, skipping `node_modules`
- **Non-destructive** — keys absent from `~/.env` fall back to the example value, so nothing is lost
- **Comment-preserving** — blank lines and `# comments` in `.env.example` are written as-is
- **Preview before you commit** — `--dry-run` shows exactly what would be written without touching the filesystem
- **MCP tool** — expose `copy_env` to any MCP-compatible host (Claude Desktop, Claude Code, etc.)
- **No magic** — the source is small, readable, and fully tested

## Installation

```sh
yarn add --dev @allons-y/envoy
```

```sh
npm install --save-dev @allons-y/envoy
```

```sh
pnpm add --save-dev @allons-y/envoy
```

```sh
bun add --dev @allons-y/envoy
```

## Usage

### CLI

Run in any project root. Envoy will find every `.env.example` recursively and create the corresponding `.env`.

```sh
envoy
```

| Flag | Alias | Description |
|---|---|---|
| `--force` | `-f` | Overwrite existing `.env` files |
| `--dry-run` | `-n` | Preview changes without writing any files |
| `--root <path>` | `-r` | Use a custom root env file (default: `~/.env`) |
| `--dir <path>` | `-d` | Directory to scan (default: current directory) |
| `--help` | `-h` | Show help |

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

### Postinstall hook

Add envoy to your `postinstall` script so new contributors get a working `.env` the moment they run `npm install`:

```json
{
  "scripts": {
    "postinstall": "envoy"
  }
}
```

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

The `copy_env` tool accepts `dir`, `force`, `dry_run`, and `root_env_path` — the same options as the CLI.

## How it works

1. Scans `dir` recursively for `.env.example` files (ignoring `node_modules`)
2. For each one, checks whether a `.env` already exists alongside it
3. Reads `~/.env` (or `--root`) into a key → value map
4. Walks every line in `.env.example`:
   - **Comments and blank lines** are written through unchanged
   - **`KEY=VALUE` lines** where `KEY` exists in `~/.env` get the root value substituted
   - **`KEY=VALUE` lines** where `KEY` is absent fall back to the example value
5. Writes the result to `.env` next to the example file

No network calls. No config files. No global state.

## Requirements

- Node.js >= 24.0.0

## License

[Apache 2.0](./LICENSE) © [Cassondra Roberts](https://allons-y.llc)
