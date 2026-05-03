import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Select } from './Select.js';

const options = [
  { value: 'naplan', label: 'NAPLAN Y5 Numeracy' },
  { value: 'icas', label: 'ICAS Math Paper C' },
];

describe('Select', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <Select label="Assessment" options={options} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('label is associated with trigger', () => {
    const { getByLabelText } = render(
      <Select label="Assessment" options={options} />,
    );
    expect(getByLabelText('Assessment')).toBeTruthy();
  });
});
