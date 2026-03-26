#!/usr/bin/env node
// @ts-check

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { copyEnv } from "./index.js";
import packageJSON from "./package.json" with { type: 'json' };

/**
 * Format an array of CopyEnvResults into a human-readable string.
 *
 * @param {import('./index.js').CopyEnvResult[]} results
 * @returns {string}
 */
export function formatResults(results) {
  if (results.length === 0) return "No .env.example files found.";

  return results
    .map((r) => {
      if (r.status === "skipped")
        return `Skipped ${r.envPath} — already exists (use force: true to overwrite)`;
      if (r.status === "would-create")
        return `Would create ${r.envPath}:\n${r.content}`;
      return `Created ${r.envPath}`;
    })
    .join("\n");
}

const server = new McpServer({
  name: packageJSON.name,
  version: packageJSON.version,
});

/**
 * MCP tool handler for copy_env. Extracted for testability.
 *
 * @param {{ dir?: string, force?: boolean, dry_run?: boolean, root_env_path?: string }} args
 * @returns {{ content: Array<{ type: string, text: string }> }}
 */
export function copyEnvToolHandler({ dir, force, dry_run, root_env_path } = {}) {
  const results = copyEnv(dir, {
    force,
    dryRun: dry_run,
    rootEnvPath: root_env_path,
  });

  return {
    content: [{ type: "text", text: formatResults(results) }],
  };
}

server.registerTool(
  "copy_env",
  {
    description:
      "Copy values from a root .env file into project .env files, using .env.example files as templates. " +
      "Searches the given directory recursively (excluding node_modules), and for each .env.example found " +
      "writes a .env alongside it, substituting values from the root .env where keys match.",
    inputSchema: {
      dir: z
        .string()
        .optional()
        .describe("Directory to scan (default: current working directory)"),
      force: z
        .boolean()
        .optional()
        .describe("Overwrite existing .env files (default: false)"),
      dry_run: z
        .boolean()
        .optional()
        .describe("Preview changes without writing any files (default: false)"),
      root_env_path: z
        .string()
        .optional()
        .describe("Path to the root .env file to source values from (default: ~/.env)"),
    },
  },
  copyEnvToolHandler,
);

// Only start the stdio transport when this file is run directly.
/* c8 ignore next 3 */
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await server.connect(new StdioServerTransport());
}
