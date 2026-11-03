// Maintained regression tests for CLI flag parsing (node:test, no framework).
// Run: npm run test -w @postor/cli   (builds first, then exercises dist)
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { hasFlag, readOption } from '../dist/report.js';

describe('flag parsing', () => {
  it('reads --db=sqlite with a bare option name', () => {
    assert.equal(readOption(['--db=sqlite'], 'db'), 'sqlite');
  });

  it('returns null when the option is absent', () => {
    assert.equal(readOption(['--json'], 'db'), null);
  });

  it('detects boolean flags', () => {
    assert.equal(hasFlag(['--check'], '--check'), true);
    assert.equal(hasFlag([], '--check'), false);
  });
});
