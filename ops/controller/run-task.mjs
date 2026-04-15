#!/usr/bin/env node
// ops/controller/run-task.mjs
// Runs a single agent task: plan → extract execution prompt → execute → review.
// Usage: node ops/controller/run-task.mjs "your task request here"
//    or: npm run agent:run -- "your task request here"

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plannerSystem, reviewerSystem, plannerUser } from './prompts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readBrief(relativePath) {
  const full = join(ROOT, relativePath);
  if (!existsSync(full)) {
    console.error(`Missing brief: ${full}`);
    process.exit(1);
  }
  return readFileSync(full, 'utf8');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Calls `claude -p -` with the prompt delivered via stdin.
 * Spawns the process directly — no shell involved on Unix/Mac.
 * On Windows, npm CLI wrappers are .cmd files and cannot be resolved without
 * a shell, so we enable the platform default (cmd.exe), never bash.
 *
 * @param {string} systemPrompt   - Prepended as SYSTEM block (pass '' to omit)
 * @param {string} userMessage
 * @param {{ skipPermissions?: boolean }} [opts]
 *   skipPermissions: pass --dangerously-skip-permissions so Claude does not
 *   pause for interactive tool-use / file-write approval. Only enable this for
 *   the execution step; keep it off for planner and reviewer (text-only).
 * @returns {string} stdout from claude
 */
function runClaudeStdin(systemPrompt, userMessage, opts = {}) {
  const combined = systemPrompt
    ? `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userMessage}`
    : userMessage;

  const args = ['-p'];
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions');
  args.push('-');

  const result = spawnSync('claude', args, {
    cwd: ROOT,
    input: combined,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    // Windows npm CLI wrappers (.cmd) require a shell to resolve.
    // process.platform gives us cmd.exe on Windows, /bin/sh elsewhere.
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `claude exited with code ${result.status}\n${result.stderr || ''}`
    );
  }

  return result.stdout;
}

/**
 * Extract the ## Execution Prompt section from the planner output.
 */
function extractExecutionPrompt(plannerOutput) {
  const match = plannerOutput.match(
    /##\s*Execution Prompt\s*\n([\s\S]+?)(?=\n##\s|\s*$)/i
  );
  if (!match) {
    throw new Error(
      'Could not extract ## Execution Prompt from planner output.\n\n' +
        plannerOutput.slice(0, 500)
    );
  }
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const taskRequest = process.argv.slice(2).join(' ').trim();

if (!taskRequest) {
  console.error('Usage: node ops/controller/run-task.mjs "task request"');
  process.exit(1);
}

const ts = timestamp();
const taskSlug = slug(taskRequest);
const taskId = `${ts}-${taskSlug}`;

const tasksDir = join(ROOT, 'ops', 'tasks');
const reviewsDir = join(ROOT, 'ops', 'reviews');
ensureDir(tasksDir);
ensureDir(reviewsDir);

const taskFile = join(tasksDir, `${taskId}.md`);
const reviewFile = join(reviewsDir, `${taskId}.md`);

console.log(`\n=== TennisBootcamp Agent ===`);
console.log(`Task: ${taskRequest}`);
console.log(`ID:   ${taskId}\n`);

// 1. Read briefs
const projectBrief = readBrief('ops/briefs/project.md');
const brandBrief = readBrief('ops/briefs/brand.md');

// 2. Plan
console.log('[1/4] Planning...');
const plannerUserMsg = plannerUser(projectBrief, brandBrief, taskRequest);
const planOutput = runClaudeStdin(plannerSystem, plannerUserMsg);
console.log('      Plan received.\n');

// 3. Extract execution prompt
console.log('[2/4] Extracting execution prompt...');
const executionPrompt = extractExecutionPrompt(planOutput);
console.log('      Execution prompt extracted.\n');

// 4. Execute
console.log('[3/4] Executing task...');
// skipPermissions lets Claude write files without stalling on approval prompts.
const executionOutput = runClaudeStdin('', executionPrompt, { skipPermissions: true });
console.log('      Execution complete.\n');

// 5. Review
console.log('[4/4] Reviewing output...');
const reviewUserMsg = [
  `## Original Task Request\n${taskRequest}`,
  `## Execution Prompt\n${executionPrompt}`,
  `## Agent Output\n${executionOutput}`,
].join('\n\n---\n\n');
const reviewOutput = runClaudeStdin(reviewerSystem, reviewUserMsg);
console.log('      Review complete.\n');

// 6. Save outputs
const taskDoc = [
  `# Task: ${taskRequest}`,
  `**ID:** ${taskId}`,
  `**Date:** ${new Date().toISOString()}`,
  '',
  '---',
  '',
  '## Plan',
  planOutput.trim(),
  '',
  '---',
  '',
  '## Execution Prompt',
  executionPrompt,
  '',
  '---',
  '',
  '## Execution Output',
  executionOutput.trim(),
].join('\n');

const reviewDoc = [
  `# Review: ${taskRequest}`,
  `**ID:** ${taskId}`,
  `**Date:** ${new Date().toISOString()}`,
  '',
  '---',
  '',
  reviewOutput.trim(),
].join('\n');

writeFileSync(taskFile, taskDoc, 'utf8');
writeFileSync(reviewFile, reviewDoc, 'utf8');

console.log(`=== Done ===`);
console.log(`Task saved:   ops/tasks/${taskId}.md`);
console.log(`Review saved: ops/reviews/${taskId}.md\n`);

// Print verdict line for quick feedback
const verdictMatch = reviewOutput.match(/##\s*Verdict\s*\n+(\w+)/i);
if (verdictMatch) {
  const verdict = verdictMatch[1].toUpperCase();
  const icon = verdict === 'PASS' ? '✓' : '✗';
  console.log(`Verdict: ${icon} ${verdict}\n`);
}
