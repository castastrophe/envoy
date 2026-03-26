#!/usr/bin/env node
// @ts-check

import path from "node:path";

import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { copyEnv } from "./index.js";

const argv = yargs(hideBin(process.argv))
  .scriptName("envoy")
  .usage("$0 [options]", "Copy values from your root ~/.env into project .env files using .env.example as a template.")
  .option("force", {
    alias: "f",
    type: "boolean",
    description: "Overwrite existing .env files",
    default: false,
  })
  .option("dry-run", {
    alias: "n",
    type: "boolean",
    description: "Preview what would be written without creating any files",
    default: false,
  })
  .option("root", {
    alias: "r",
    type: "string",
    description: "Path to root .env file (default: ~/.env)",
  })
  .option("dir", {
    alias: "d",
    type: "string",
    description: "Directory to scan (default: current directory)",
  })
  .help()
  .parseSync();

const dir = argv.dir ? path.resolve(/** @type {string} */ (argv.dir)) : process.cwd();

const results = copyEnv(dir, {
  force: /** @type {boolean} */ (argv.force),
  dryRun: /** @type {boolean} */ (argv["dry-run"]),
  rootEnvPath: /** @type {string | undefined} */ (argv.root),
});

if (results.length === 0) {
  console.log(chalk.yellow("No .env.example files found."));
  process.exit(0);
}

for (const result of results) {
  if (result.status === "skipped") {
    console.log(
      chalk.dim(
        `⏭  Skipped ${result.envPath} — already exists (use --force to overwrite)`,
      ),
    );
  } else if (result.status === "would-create") {
    console.log(chalk.cyan(`🔍 Would create ${result.envPath}:`));
    console.log(chalk.dim(result.content));
  } else {
    console.log(chalk.green(`✨ Created ${result.envPath}`));
  }
}
