import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { StatTile } from './StatTile.js';

describe('StatTile', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<StatTile label="Sessions completed" value={12} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('positive sentiment renders trend', () => {
    const { getByText } = render(
      <StatTile label="Accuracy" value="87%" trend="+5%" sentiment="positive" />,
    );
    expect(getByText('+5%')).toBeTruthy();
  });
});
