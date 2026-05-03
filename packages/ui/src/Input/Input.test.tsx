import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Input } from './Input.js';

describe('Input', () => {
  it('idle state has no serious/critical axe violations', async () => {
    const { container } = render(<form><Input label="Email address" /></form>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('error state sets aria-invalid', () => {
    const { getByRole } = render(
      <form><Input label="Email" error="Invalid email." /></form>,
    );
    expect(getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('error state has no violations', async () => {
    const { container } = render(
      <form><Input label="Email" error="Please enter a valid email." /></form>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('has min-h-[44px] class', () => {
    const { getByRole } = render(<form><Input label="Email" /></form>);
    expect(getByRole('textbox').className).toContain('min-h-[44px]');
  });
});
