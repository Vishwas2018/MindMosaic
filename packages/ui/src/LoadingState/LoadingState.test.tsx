import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { LoadingState } from './LoadingState.js';

describe('LoadingState', () => {
  it('card variant has no serious/critical axe violations', async () => {
    const { container } = render(<LoadingState variant="card" />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('row variant has no violations', async () => {
    const { container } = render(<LoadingState variant="row" rows={3} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
