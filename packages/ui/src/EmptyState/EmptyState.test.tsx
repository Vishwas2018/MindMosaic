import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <EmptyState title="No sessions yet" description="Start a session to begin." />,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
