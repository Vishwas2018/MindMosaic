import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import type { AxeResults } from 'axe-core';

afterEach(cleanup);

expect.extend(toHaveNoViolations);

// X2: CI gate fails only on serious/critical; moderate/minor surface as console warnings.
expect.extend({
  toHaveNoSeriousViolations(received: AxeResults) {
    const serious = received.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    const minor = received.violations.filter(
      (v) => v.impact !== 'serious' && v.impact !== 'critical',
    );

    if (minor.length > 0) {
      console.info(
        `[axe] ${minor.length} minor/moderate violation(s) (not blocking):\n` +
          minor.map((v) => `  [${v.impact}] ${v.id}: ${v.description}`).join('\n'),
      );
    }

    if (serious.length === 0) {
      return { pass: true, message: () => '' };
    }
    const detail = serious
      .map(
        (v) =>
          `  [${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes.map((n) => `    ${n.html}`).join('\n'),
      )
      .join('\n');
    return {
      pass: false,
      message: () => `Found ${serious.length} serious/critical axe violation(s):\n${detail}`,
    };
  },
});
