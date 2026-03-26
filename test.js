// @ts-check

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import test from "ava";

import { spawnSync } from "node:child_process";

import {
  auditEnvFile,
  buildEnvContent,
  copyEnv,
  findExampleFiles,
  parseEnvFile,
  parseLine,
  processExampleFile,
} from "./index.js";
import { copyEnvToolHandler, formatResults } from "./mcp.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** @returns {string} */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "envoy-"));
}

/** @param {string} dir */
function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Initialise a bare git repo in a temp directory, optionally writing a
 * .gitignore and making an initial commit so the repo has a HEAD.
 *
 * @param {{ gitignore?: string }} [opts]
 * @returns {string} path to the new repo
 */
function tmpGitDir({ gitignore = "" } = {}) {
  const dir = tmpDir();
  const git = (/** @type {string[]} */ args) =>
    spawnSync("git", args, { cwd: dir });
  git(["init"]);
  git(["config", "user.email", "test@envoy.dev"]);
  git(["config", "user.name", "Envoy Test"]);
  if (gitignore) {
    fs.writeFileSync(path.join(dir, ".gitignore"), gitignore);
    git(["add", ".gitignore"]);
    git(["commit", "-m", "init"]);
  }
  return dir;
}

// ─── parseLine ───────────────────────────────────────────────────────────────

test("parseLine: returns null for an empty string", (t) =>
  t.is(parseLine(""), null));

test("parseLine: returns null for whitespace-only input", (t) =>
  t.is(parseLine("   "), null));

test("parseLine: returns null for comment lines", (t) => {
  t.is(parseLine("# a comment"), null);
  t.is(parseLine("  # indented"), null);
});

test("parseLine: returns null for lines without =", (t) =>
  t.is(parseLine("JUST_A_KEY"), null));

test("parseLine: returns null when key is empty", (t) =>
  t.is(parseLine("=value"), null));

test("parseLine: parses a standard KEY=VALUE pair", (t) =>
  t.deepEqual(parseLine("KEY=value"), { key: "KEY", value: "value" }));

test("parseLine: handles an empty value (KEY=)", (t) =>
  t.deepEqual(parseLine("KEY="), { key: "KEY", value: "" }));

test("parseLine: handles a value that contains =", (t) =>
  t.deepEqual(parseLine("URL=http://x.com?a=1&b=2"), {
    key: "URL",
    value: "http://x.com?a=1&b=2",
  }));

// ─── parseEnvFile ────────────────────────────────────────────────────────────

test("parseEnvFile: returns an empty Map for a non-existent file", (t) =>
  t.is(parseEnvFile("/nonexistent/.env").size, 0));

test("parseEnvFile: parses key/value pairs and skips comments", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env"), "# comment\nFOO=bar\nBAZ=qux\n");
    const map = parseEnvFile(path.join(dir, ".env"));
    t.is(map.get("FOO"), "bar");
    t.is(map.get("BAZ"), "qux");
    t.is(map.size, 2);
  } finally {
    cleanup(dir);
  }
});

// ─── findExampleFiles ─────────────────────────────────────────────────────────

test("findExampleFiles: locates a .env.example in the root dir", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "");
    const files = findExampleFiles(dir);
    t.is(files.length, 1);
    t.true(files[0].endsWith(".env.example"));
  } finally {
    cleanup(dir);
  }
});

test("findExampleFiles: excludes node_modules", (t) => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", "pkg", ".env.example"),
      "",
    );
    fs.writeFileSync(path.join(dir, ".env.example"), "");
    const files = findExampleFiles(dir);
    t.is(files.length, 1);
    t.false(files[0].includes("node_modules"));
  } finally {
    cleanup(dir);
  }
});

test("findExampleFiles: finds nested .env.example files", (t) => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".env.example"), "");
    fs.writeFileSync(path.join(dir, "packages", "a", ".env.example"), "");
    t.is(findExampleFiles(dir).length, 2);
  } finally {
    cleanup(dir);
  }
});

// ─── buildEnvContent ─────────────────────────────────────────────────────────

test("buildEnvContent: preserves comments and blank lines", (t) => {
  const dir = tmpDir();
  try {
    const example = "# App config\nFOO=bar\n\n# DB\nDB=postgres\n";
    fs.writeFileSync(path.join(dir, ".env.example"), example);
    const content = buildEnvContent(
      path.join(dir, ".env.example"),
      new Map(),
    );
    t.is(content, example);
  } finally {
    cleanup(dir);
  }
});

test("buildEnvContent: replaces values found in rootEnv", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, ".env.example"),
      "FOO=default\nBAR=stays\n",
    );
    const content = buildEnvContent(
      path.join(dir, ".env.example"),
      new Map([["FOO", "from-root"]]),
    );
    t.true(content.includes("FOO=from-root"));
    t.true(content.includes("BAR=stays"));
  } finally {
    cleanup(dir);
  }
});

test("buildEnvContent: leaves keys absent from rootEnv unchanged", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "MISSING=fallback\n");
    const content = buildEnvContent(
      path.join(dir, ".env.example"),
      new Map(),
    );
    t.is(content, "MISSING=fallback\n");
  } finally {
    cleanup(dir);
  }
});

// ─── processExampleFile ───────────────────────────────────────────────────────

test("processExampleFile: returns skipped when .env already exists", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    fs.writeFileSync(path.join(dir, ".env"), "FOO=existing\n");
    const result = processExampleFile(
      path.join(dir, ".env.example"),
      new Map(),
    );
    t.is(result.status, "skipped");
  } finally {
    cleanup(dir);
  }
});

test("processExampleFile: returns would-create and content for dry-run", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const result = processExampleFile(
      path.join(dir, ".env.example"),
      new Map(),
      { dryRun: true },
    );
    t.is(result.status, "would-create");
    t.is(result.content, "FOO=bar\n");
    t.false(fs.existsSync(path.join(dir, ".env")));
  } finally {
    cleanup(dir);
  }
});

// ─── copyEnv ─────────────────────────────────────────────────────────────────

test("copyEnv: creates a .env file from .env.example", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const [result] = copyEnv(dir);
    t.is(result.status, "created");
    t.true(fs.existsSync(path.join(dir, ".env")));
    t.is(fs.readFileSync(path.join(dir, ".env"), "utf8"), "FOO=bar\n");
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: skips when .env already exists", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    fs.writeFileSync(path.join(dir, ".env"), "FOO=existing\n");
    const [result] = copyEnv(dir);
    t.is(result.status, "skipped");
    t.is(
      fs.readFileSync(path.join(dir, ".env"), "utf8"),
      "FOO=existing\n",
    );
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: --force overwrites an existing .env", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=new\n");
    fs.writeFileSync(path.join(dir, ".env"), "FOO=old\n");
    const [result] = copyEnv(dir, { force: true });
    t.is(result.status, "created");
    t.is(fs.readFileSync(path.join(dir, ".env"), "utf8"), "FOO=new\n");
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: --dry-run does not write any files", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const [result] = copyEnv(dir, { dryRun: true });
    t.is(result.status, "would-create");
    t.is(result.content, "FOO=bar\n");
    t.false(fs.existsSync(path.join(dir, ".env")));
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: substitutes values from a custom rootEnvPath", (t) => {
  const dir = tmpDir();
  try {
    const rootEnv = path.join(dir, "root.env");
    fs.writeFileSync(rootEnv, "FOO=from-root\n");
    fs.writeFileSync(
      path.join(dir, ".env.example"),
      "FOO=default\nBAR=stays\n",
    );
    copyEnv(dir, { rootEnvPath: rootEnv });
    const content = fs.readFileSync(path.join(dir, ".env"), "utf8");
    t.true(content.includes("FOO=from-root"));
    t.true(content.includes("BAR=stays"));
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: returns an empty array when no .env.example files exist", (t) => {
  const dir = tmpDir();
  try {
    t.deepEqual(copyEnv(dir), []);
  } finally {
    cleanup(dir);
  }
});

test("copyEnv: handles multiple .env.example files in nested dirs", (t) => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, "packages", "a"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".env.example"), "ROOT=1\n");
    fs.writeFileSync(
      path.join(dir, "packages", "a", ".env.example"),
      "PKG=1\n",
    );
    const results = copyEnv(dir);
    t.is(results.length, 2);
    t.true(results.every((r) => r.status === "created"));
  } finally {
    cleanup(dir);
  }
});

// ─── formatResults (MCP) ─────────────────────────────────────────────────────

test("formatResults: returns a message when no results", (t) =>
  t.is(formatResults([]), "No .env.example files found."));

test("formatResults: describes a created result", (t) => {
  const text = formatResults([
    { examplePath: "/p/.env.example", envPath: "/p/.env", status: "created" },
  ]);
  t.true(text.includes("Created /p/.env"));
});

test("formatResults: describes a skipped result", (t) => {
  const text = formatResults([
    { examplePath: "/p/.env.example", envPath: "/p/.env", status: "skipped" },
  ]);
  t.true(text.includes("Skipped /p/.env"));
  t.true(text.includes("already exists"));
});

test("formatResults: describes a would-create result with content", (t) => {
  const text = formatResults([
    {
      examplePath: "/p/.env.example",
      envPath: "/p/.env",
      status: "would-create",
      content: "FOO=bar\n",
    },
  ]);
  t.true(text.includes("Would create /p/.env"));
  t.true(text.includes("FOO=bar"));
});

test("formatResults: joins multiple results with newlines", (t) => {
  const text = formatResults([
    { examplePath: "/a/.env.example", envPath: "/a/.env", status: "created" },
    { examplePath: "/b/.env.example", envPath: "/b/.env", status: "skipped" },
  ]);
  t.true(text.includes("Created /a/.env"));
  t.true(text.includes("Skipped /b/.env"));
});

// ─── copyEnvToolHandler (MCP) ─────────────────────────────────────────────────

test("copyEnvToolHandler: returns MCP content structure", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const response = copyEnvToolHandler({ dir });
    t.true(Array.isArray(response.content));
    t.is(response.content[0].type, "text");
    t.true(typeof response.content[0].text === "string");
  } finally {
    cleanup(dir);
  }
});

test("copyEnvToolHandler: created result appears in response text", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const { content } = copyEnvToolHandler({ dir });
    t.true(content[0].text.includes("Created"));
  } finally {
    cleanup(dir);
  }
});

test("copyEnvToolHandler: dry_run does not write files", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const { content } = copyEnvToolHandler({ dir, dry_run: true });
    t.false(fs.existsSync(path.join(dir, ".env")));
    t.true(content[0].text.includes("Would create"));
  } finally {
    cleanup(dir);
  }
});

test("copyEnvToolHandler: substitutes values from root_env_path", (t) => {
  const dir = tmpDir();
  try {
    const rootEnv = path.join(dir, "root.env");
    fs.writeFileSync(rootEnv, "FOO=from-root\n");
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=default\n");
    const { content } = copyEnvToolHandler({ dir, root_env_path: rootEnv });
    t.true(content[0].text.includes("Created"));
    t.is(fs.readFileSync(path.join(dir, ".env"), "utf8"), "FOO=from-root\n");
  } finally {
    cleanup(dir);
  }
});

test("copyEnvToolHandler: returns no-files message when dir is empty", (t) => {
  const dir = tmpDir();
  try {
    const { content } = copyEnvToolHandler({ dir });
    t.is(content[0].text, "No .env.example files found.");
  } finally {
    cleanup(dir);
  }
});

// ─── auditEnvFile ─────────────────────────────────────────────────────────────

test("auditEnvFile: returns isGitRepo false outside a git repo", (t) => {
  const dir = tmpDir();
  try {
    const result = auditEnvFile(path.join(dir, ".env"));
    t.false(result.isGitRepo);
    t.false(result.isGitignored);
    t.false(result.isTracked);
  } finally {
    cleanup(dir);
  }
});

test("auditEnvFile: isGitignored true when .env is in .gitignore", (t) => {
  const dir = tmpGitDir({ gitignore: ".env\n" });
  try {
    const result = auditEnvFile(path.join(dir, ".env"));
    t.true(result.isGitRepo);
    t.true(result.isGitignored);
    t.false(result.isTracked);
  } finally {
    cleanup(dir);
  }
});

test("auditEnvFile: isGitignored false when .env is absent from .gitignore", (t) => {
  const dir = tmpGitDir({ gitignore: "*.log\n" });
  try {
    const result = auditEnvFile(path.join(dir, ".env"));
    t.true(result.isGitRepo);
    t.false(result.isGitignored);
    t.false(result.isTracked);
  } finally {
    cleanup(dir);
  }
});

test("auditEnvFile: isTracked true when .env is committed to the repo", (t) => {
  const dir = tmpGitDir({ gitignore: "*.log\n" });
  try {
    const git = (/** @type {string[]} */ args) =>
      spawnSync("git", args, { cwd: dir });
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=oops\n");
    git(["add", ".env"]);
    git(["commit", "-m", "accidentally commit .env"]);
    const result = auditEnvFile(path.join(dir, ".env"));
    t.true(result.isGitRepo);
    t.true(result.isTracked);
  } finally {
    cleanup(dir);
  }
});

// ─── processExampleFile audit integration ────────────────────────────────────

test("processExampleFile: blocks and does not write when .env is tracked", (t) => {
  const dir = tmpGitDir({ gitignore: "*.log\n" });
  try {
    const git = (/** @type {string[]} */ args) =>
      spawnSync("git", args, { cwd: dir });
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=tracked\n");
    git(["add", ".env"]);
    git(["commit", "-m", "accidentally commit .env"]);
    fs.writeFileSync(path.join(dir, ".env.example"), "SECRET=example\n");
    // Remove the existing .env so processExampleFile doesn't skip it
    fs.rmSync(path.join(dir, ".env"));
    const result = processExampleFile(
      path.join(dir, ".env.example"),
      new Map(),
    );
    t.is(result.status, "blocked");
    t.true(result.audit?.isTracked);
    t.false(fs.existsSync(path.join(dir, ".env")));
  } finally {
    cleanup(dir);
  }
});

test("processExampleFile: includes audit result with gitignore warning", (t) => {
  const dir = tmpGitDir({ gitignore: "*.log\n" });
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const result = processExampleFile(
      path.join(dir, ".env.example"),
      new Map(),
    );
    t.is(result.status, "created");
    t.true(result.audit?.isGitRepo);
    t.false(result.audit?.isGitignored);
  } finally {
    cleanup(dir);
  }
});

test("processExampleFile: skipAudit omits audit result entirely", (t) => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "FOO=bar\n");
    const result = processExampleFile(
      path.join(dir, ".env.example"),
      new Map(),
      { skipAudit: true },
    );
    t.is(result.status, "created");
    t.is(result.audit, undefined);
  } finally {
    cleanup(dir);
  }
});

// ─── formatResults audit warnings ────────────────────────────────────────────

test("formatResults: describes a blocked result", (t) => {
  const text = formatResults([
    {
      examplePath: "/p/.env.example",
      envPath: "/p/.env",
      status: "blocked",
      audit: { isGitRepo: true, isGitignored: false, isTracked: true },
    },
  ]);
  t.true(text.includes("Blocked /p/.env"));
  t.true(text.includes("git rm --cached"));
});

test("formatResults: appends gitignore warning when not gitignored", (t) => {
  const text = formatResults([
    {
      examplePath: "/p/.env.example",
      envPath: "/p/.env",
      status: "created",
      audit: { isGitRepo: true, isGitignored: false, isTracked: false },
    },
  ]);
  t.true(text.includes("Created /p/.env"));
  t.true(text.includes("not covered by .gitignore"));
});

test("formatResults: no gitignore warning when properly gitignored", (t) => {
  const text = formatResults([
    {
      examplePath: "/p/.env.example",
      envPath: "/p/.env",
      status: "created",
      audit: { isGitRepo: true, isGitignored: true, isTracked: false },
    },
  ]);
  t.false(text.includes(".gitignore"));
});
