import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Tooltip } from './Tooltip.js';

describe('Tooltip', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <Tooltip content="Helpful tip">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
