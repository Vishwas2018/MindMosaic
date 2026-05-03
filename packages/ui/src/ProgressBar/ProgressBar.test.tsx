import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from './ProgressBar.js';

describe('ProgressBar', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<ProgressBar value={65} label="Progress" />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('sets aria-valuenow', () => {
    const { getByRole } = render(<ProgressBar value={75} label="Score" />);
    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });
});
