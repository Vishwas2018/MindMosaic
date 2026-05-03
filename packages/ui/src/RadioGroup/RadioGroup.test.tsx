import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { RadioGroup } from './RadioGroup.js';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('RadioGroup', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <RadioGroup label="Choose an option" options={options} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
