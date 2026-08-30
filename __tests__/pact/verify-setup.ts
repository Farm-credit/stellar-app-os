#!/usr/bin/env ts-node
/**
 * Contract Testing Setup Verification Script
 *
 * Verifies that all components of the Pact contract testing infrastructure
 * are properly installed and configured.
 */

import fs from 'fs';
import path from 'path';

interface VerificationResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

const results: VerificationResult[] = [];

function checkFile(filePath: string, description: string): void {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    results.push({
      name: description,
      status: 'pass',
      message: `✓ ${filePath}`,
    });
  } else {
    results.push({
      name: description,
      status: 'fail',
      message: `✗ Missing: ${filePath}`,
    });
  }
}

function checkDirectory(dirPath: string, description: string): void {
  const fullPath = path.resolve(process.cwd(), dirPath);
  if (fs.existsSync(fullPath)) {
    results.push({
      name: description,
      status: 'pass',
      message: `✓ ${dirPath}`,
    });
  } else {
    results.push({
      name: description,
      status: 'fail',
      message: `✗ Missing: ${dirPath}`,
    });
  }
}

function checkDependency(packageName: string): void {
  try {
    require.resolve(packageName);
    results.push({
      name: `Dependency: ${packageName}`,
      status: 'pass',
      message: `✓ ${packageName} is installed`,
    });
  } catch (error) {
    results.push({
      name: `Dependency: ${packageName}`,
      status: 'fail',
      message: `✗ ${packageName} is not installed`,
    });
  }
}

async function runVerification(): Promise<void> {
  console.log('🔍 Verifying Contract Testing Setup...\n');

  // Check core files
  console.log('📁 Checking core files...');
  checkFile('__tests__/pact/setup.ts', 'Pact Setup Configuration');
  checkFile('__tests__/pact/openapi-validator.ts', 'OpenAPI Validator');
  checkFile('__tests__/pact/matchers.ts', 'Pact Matchers');
  checkFile('__tests__/pact/reporter.ts', 'Test Reporter');

  // Check test files
  console.log('🧪 Checking test files...');
  checkFile('__tests__/pact/health.pact.test.ts', 'Health Check Tests');
  checkFile('__tests__/pact/auth.pact.test.ts', 'Authentication Tests');
  checkFile('__tests__/pact/trees.pact.test.ts', 'Trees Endpoint Tests');
  checkFile('__tests__/pact/comprehensive-example.pact.test.ts', 'Comprehensive Example');

  // Check OpenAPI spec
  console.log('📋 Checking OpenAPI specification...');
  checkFile('docs/openapi.yaml', 'OpenAPI Specification');

  // Check directories
  console.log('📂 Checking directories...');
  checkDirectory('__tests__/pact', 'Pact Test Directory');
  checkDirectory('__tests__/pact/pacts', 'Pacts Output Directory');
  checkDirectory('__tests__/pact/logs', 'Logs Directory');

  // Check dependencies
  console.log('📦 Checking dependencies...');
  checkDependency('@pact-foundation/pact');
  checkDependency('openapi-enforcer');
  checkDependency('swagger-parser');
  checkDependency('vitest');

  // Print results
  console.log('\n=== Verification Results ===\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  results.forEach((result) => {
    console.log(`${result.message}`);
  });

  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('✨ All checks passed! Contract testing is ready to use.\n');
    console.log('Next steps:');
    console.log('  1. Run tests: pnpm test -- --run __tests__/pact');
    console.log('  2. View reports: open __tests__/pact/reports/');
    console.log('  3. Add more tests for your endpoints\n');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. Please review the messages above.\n');
    process.exit(1);
  }
}

runVerification().catch((error) => {
  console.error('Verification error:', error);
  process.exit(1);
});
