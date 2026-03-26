// @ts-check

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
 * @typedef {Object} CopyEnvOptions
 * @property {boolean} [force]       Overwrite an existing `.env` file
 * @property {boolean} [dryRun]      Return a preview without writing any files
 * @property {string}  [rootEnvPath] Path to the root `.env` (default: `~/.env`)
 */

/**
 * @typedef {'created' | 'skipped' | 'would-create'} CopyEnvStatus
 *
 * @typedef {Object} CopyEnvResult
 * @property {string}        examplePath
 * @property {string}        envPath
 * @property {CopyEnvStatus} status
 * @property {string}        [content]  Present when status is `'would-create'`
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

  const content = buildEnvContent(examplePath, rootEnv);

  if (options.dryRun) {
    return { examplePath, envPath, status: "would-create", content };
  }

  fs.writeFileSync(envPath, content, "utf8");
  return { examplePath, envPath, status: "created" };
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
