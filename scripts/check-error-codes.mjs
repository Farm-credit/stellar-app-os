#!/usr/bin/env node
/**
 * Soroban contract error-code standard check - Issue #1813
 *
 * Scans every `#[contracterror]` enum under contracts/ and verifies the rules
 * in docs/CONTRACT_ERROR_CODES.md:
 *   1. codes inside one enum are unique and non-zero (reported as warnings,
 *      not failures, for crates still listed under "legacy");
 *   2. every code sits inside the block reserved for its crate in
 *      contracts/error-code-ranges.json (crates listed under "legacy" are
 *      exempt until they are migrated);
 *   3. no two crates share a block, so a code identifies its contract.
 *
 * Usage: node scripts/check-error-codes.mjs [--list]
 * Exits 1 when a rule is broken.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractsDir = path.join(root, 'contracts');
const registryPath = path.join(contractsDir, 'error-code-ranges.json');

const ENUM_RE = /#\[contracterror[^\]]*\][\s\S]*?pub enum (\w+)\s*\{([\s\S]*?)\n\s*\}/g;
const VARIANT_RE = /^\s*(\w+)\s*=\s*(\d+)\s*,?/gm;

function rustFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'target' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...rustFiles(full));
    else if (entry.name.endsWith('.rs')) files.push(full);
  }
  return files;
}

/** Drops whole-line `//` comments so commented-out variants are not counted. */
function stripLineComments(source) {
  return source.replace(/^\s*\/\/.*$/gm, '');
}

export function collectEnums() {
  const found = [];
  for (const crate of fs.readdirSync(contractsDir, { withFileTypes: true })) {
    if (!crate.isDirectory() || crate.name === 'target') continue;
    const srcDir = path.join(contractsDir, crate.name);
    if (!fs.existsSync(path.join(srcDir, 'Cargo.toml'))) continue;
    for (const file of rustFiles(srcDir)) {
      const source = stripLineComments(fs.readFileSync(file, 'utf8'));
      for (const match of source.matchAll(ENUM_RE)) {
        const variants = [...match[2].matchAll(VARIANT_RE)].map((v) => ({
          name: v[1],
          code: Number(v[2]),
        }));
        if (variants.length === 0) continue;
        found.push({
          crate: crate.name,
          file: path.relative(root, file).replace(/\\/g, '/'),
          name: match[1],
          variants,
        });
      }
    }
  }
  return found;
}

export function checkEnums(enums, registry, warnings = []) {
  const problems = [];
  const ranges = registry.ranges ?? {};
  const legacy = new Set(registry.legacy ?? []);

  const entries = Object.entries(ranges);
  for (let i = 0; i < entries.length; i++) {
    const [a, [aMin, aMax]] = entries[i];
    if (aMin > aMax) problems.push(`registry: ${a} has an inverted range [${aMin}, ${aMax}]`);
    for (let j = i + 1; j < entries.length; j++) {
      const [b, [bMin, bMax]] = entries[j];
      if (aMin <= bMax && bMin <= aMax) {
        problems.push(
          `registry: ranges of ${a} [${aMin}-${aMax}] and ${b} [${bMin}-${bMax}] overlap`
        );
      }
    }
  }

  for (const e of enums) {
    const where = `${e.file} ${e.name}`;
    const isLegacy = legacy.has(e.crate);
    const sink = isLegacy ? warnings : problems;
    const seen = new Map();
    for (const v of e.variants) {
      if (v.code === 0) sink.push(`${where}: ${v.name} uses reserved code 0`);
      if (seen.has(v.code)) {
        sink.push(`${where}: code ${v.code} used by both ${seen.get(v.code)} and ${v.name}`);
      }
      seen.set(v.code, v.name);
    }
    if (isLegacy) continue;
    const range = ranges[e.crate];
    if (!range) {
      problems.push(
        `${where}: crate "${e.crate}" has no range in contracts/error-code-ranges.json`
      );
      continue;
    }
    for (const v of e.variants) {
      if (v.code < range[0] || v.code > range[1]) {
        problems.push(
          `${where}: ${v.name} = ${v.code} is outside ${e.crate}'s range [${range[0]}-${range[1]}]`
        );
      }
    }
  }
  return problems;
}

function main() {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const enums = collectEnums();

  if (process.argv.includes('--list')) {
    for (const e of enums) {
      const codes = e.variants.map((v) => v.code);
      console.log(
        `${e.crate.padEnd(28)} ${e.name.padEnd(28)} ${String(codes.length).padStart(3)} codes  ${Math.min(...codes)}-${Math.max(...codes)}`
      );
    }
    return;
  }

  const warnings = [];
  const problems = checkEnums(enums, registry, warnings);
  for (const w of warnings) console.warn(`warning (legacy crate): ${w}`);
  if (problems.length > 0) {
    console.error(`Contract error-code check failed (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const pending = (registry.legacy ?? []).length;
  console.log(
    `Contract error codes OK: ${enums.length} enums across ${new Set(enums.map((e) => e.crate)).size} crates (${pending} legacy crates not yet migrated).`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
