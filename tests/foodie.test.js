// Unit / integration test driver for FOODIE (report sections 3 and 4).
// TC-01, TC-02 and TC-08 are expected to FAIL on this build: they expose BUG-01, BUG-02 and BUG-03.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TEST_CASES, DEFECTS } = require('../js/testcases.js');

for (const tc of TEST_CASES) {
  const defect = DEFECTS.find((d) => d.id === tc.defect);
  const name = `${tc.id} ${tc.title} [${tc.technique}]${defect ? ` -> ${defect.id}` : ''}`;

  if (!tc.run) {
    test(name, { skip: `manual test (report: ${tc.reportStatus})` }, () => {});
    continue;
  }

  test(name, () => {
    const { rows } = tc.run();
    const failures = rows.filter((r) => !r.pass)
      .map((r) => `${r.label} (${r.input}): expected ${r.expected}, got ${r.actual}`);
    assert.equal(failures.length, 0,
      `${failures.join('; ')}${defect ? ` | ${defect.id}: ${defect.rootCause}` : ''}`);
  });
}
