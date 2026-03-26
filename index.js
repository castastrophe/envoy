// @ts-check

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Parse a single line from a .env file into its key and value.
 * Returns null for comments, blank lines, or lines without `=`.
 *
 * @param {string} line
 * @returns {{ key: string, value: string } | null}
 */
export function parseLine(line) {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith("#")) return null;

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) return null;

  const key = trimmed.slice(0, eqIndex).trim();
  if (!key) return null;

  return { key, value: trimmed.slice(eqIndex + 1) };
}

/**
 * Parse a .env file into a Map of key → value.
 * Returns an empty Map if the file does not exist.
 *
 * @param {string} filePath
 * @returns {Map<string, string>}
 */
export function parseEnvFile(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;

  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const parsed = parseLine(line);
    if (parsed) map.set(parsed.key, parsed.value);
  }

  return map;
}

/**
 * Recursively find all `.env.example` files under `dir`, excluding `node_modules`.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function findExampleFiles(dir) {
  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findExampleFiles(fullPath));
    } else if (entry.name === ".env.example") {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Build the output content for a `.env` file by merging `.env.example` lines
 * with values sourced from the root env map. Comments and blank lines are
 * preserved as-is. Keys present in rootEnv have their values replaced.
 *
 * @param {string} examplePath
 * @param {Map<string, string>} rootEnv
 * @returns {string}
 */
export function buildEnvContent(examplePath, rootEnv) {
  const lines = fs.readFileSync(examplePath, "utf8").split("\n");

  return lines
    .map((line) => {
      const parsed = parseLine(line);
      if (!parsed) return line;
      return rootEnv.has(parsed.key)
        ? `${parsed.key}=${rootEnv.get(parsed.key)}`
        : line;
    })
    .join("\n");
}

/**
 * @typedef {Object} AuditResult
 * @property {boolean} isGitRepo     — false when the path is not inside a git repository (remaining fields are false)
 * @property {boolean} isGitignored  — true when `.env` is covered by a gitignore rule
 * @property {boolean} isTracked     — true when `.env` is currently tracked by git (writing would expose secrets)
 */

/**
 * Audit the prospective `.env` path for git safety.
 *
 * Uses `git check-ignore` to verify the file is gitignored, and `git ls-files`
 * to confirm it is not already tracked. Both commands are no-ops when git is
 * unavailable or the path is outside a repository.
 *
 * @param {string} envPath  Absolute path to the `.env` file (need not exist yet)
 * @returns {AuditResult}
 */
export function auditEnvFile(envPath) {
  const cwd = path.dirname(envPath);
  const git = (/** @type {string[]} */ args) =>
    spawnSync("git", args, { cwd, encoding: "utf8" });

  if (git(["rev-parse", "--git-dir"]).status !== 0) {
    return { isGitRepo: false, isGitignored: false, isTracked: false };
  }

  return {
    isGitRepo: true,
    isGitignored: git(["check-ignore", "-q", envPath]).status === 0,
    isTracked: git(["ls-files", "--error-unmatch", envPath]).status === 0,
  };
}

/**
 * @typedef {Object} CopyEnvOptions
 * @property {boolean} [force]       Overwrite an existing `.env` file
 * @property {boolean} [dryRun]      Return a preview without writing any files
 * @property {string}  [rootEnvPath] Path to the root `.env` (default: `~/.env`)
 * @property {boolean} [skipAudit]   Skip gitignore and tracking safety checks
 */

/**
 * @typedef {'created' | 'skipped' | 'would-create' | 'blocked'} CopyEnvStatus
 *
 * @typedef {Object} CopyEnvResult
 * @property {string}        examplePath
 * @property {string}        envPath
 * @property {CopyEnvStatus} status
 * @property {string}        [content]  Present when status is `'would-create'`
 * @property {AuditResult}   [audit]    Present when audit was run
 */

/**
 * Process a single `.env.example` file, writing the merged `.env` alongside it.
 *
 * @param {string}              examplePath
 * @param {Map<string, string>} rootEnv
 * @param {CopyEnvOptions}      [options]
 * @returns {CopyEnvResult}
 */
export function processExampleFile(examplePath, rootEnv, options = {}) {
  const envPath = path.join(path.dirname(examplePath), ".env");

  if (!options.force && fs.existsSync(envPath)) {
    return { examplePath, envPath, status: "skipped" };
  }

  const audit = options.skipAudit ? undefined : auditEnvFile(envPath);

  if (audit?.isTracked) {
    return { examplePath, envPath, status: "blocked", audit };
  }

  const content = buildEnvContent(examplePath, rootEnv);

  if (options.dryRun) {
    return { examplePath, envPath, status: "would-create", content, audit };
  }

  fs.writeFileSync(envPath, content, "utf8");
  return { examplePath, envPath, status: "created", audit };
}

/**
 * Find all `.env.example` files under `dir` and copy matching values from the
 * root `.env` into each project's `.env` file.
 *
 * @param {string}         [dir]     Directory to scan (default: `process.cwd()`)
 * @param {CopyEnvOptions} [options]
 * @returns {CopyEnvResult[]}
 */
export function copyEnv(dir = process.cwd(), options = {}) {
  const rootEnvPath = options.rootEnvPath ?? path.join(os.homedir(), ".env");
  const rootEnv = parseEnvFile(rootEnvPath);
  return findExampleFiles(dir).map((examplePath) =>
    processExampleFile(examplePath, rootEnv, options),
  );
}
