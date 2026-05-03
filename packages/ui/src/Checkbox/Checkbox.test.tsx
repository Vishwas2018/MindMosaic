import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Checkbox } from './Checkbox.js';

describe('Checkbox', () => {
  it('unchecked state has no serious/critical axe violations', async () => {
    const { container } = render(<Checkbox label="I agree to the terms" />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('checked state has no violations', async () => {
    const { container } = render(<Checkbox label="I agree to the terms" checked onCheckedChange={() => {}} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
