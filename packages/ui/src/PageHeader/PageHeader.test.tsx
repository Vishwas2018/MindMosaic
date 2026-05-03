import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { PageHeader } from './PageHeader.js';

describe('PageHeader', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <main><PageHeader title="Dashboard" subtitle="Track your progress" /></main>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
