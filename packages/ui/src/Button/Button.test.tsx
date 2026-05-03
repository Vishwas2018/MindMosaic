import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  it('primary variant has no serious/critical axe violations', async () => {
    const { container } = render(<Button>Continue</Button>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  // X6: size="md" must have min 44px height. We assert via class.
  it('size="md" has h-11 class (44px height)', () => {
    const { getByRole } = render(<Button size="md">Submit</Button>);
    expect(getByRole('button').className).toContain('h-11');
  });

  it('loading state sets aria-busy', () => {
    const { getByRole } = render(<Button loading>Saving</Button>);
    expect(getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('disabled state sets aria-disabled', () => {
    const { getByRole } = render(<Button disabled>Unavailable</Button>);
    expect(getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('all variants have no violations', async () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'submit'] as const) {
      const { container } = render(<Button variant={variant}>{variant}</Button>);
      const results = await axe(container);
      expect(results).toHaveNoSeriousViolations();
    }
  });
});
