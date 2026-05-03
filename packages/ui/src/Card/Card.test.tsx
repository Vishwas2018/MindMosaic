import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Card } from './Card.js';

describe('Card', () => {
  it('default has no serious/critical axe violations', async () => {
    const { container } = render(<Card><p>Card content</p></Card>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('interactive Card has tabIndex 0', () => {
    const { container } = render(<Card interactive><p>Click me</p></Card>);
    expect(container.querySelector('[tabindex="0"]')).toBeTruthy();
  });
});
