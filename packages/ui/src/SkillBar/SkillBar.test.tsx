import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { SkillBar } from './SkillBar.js';

describe('SkillBar', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<SkillBar label="Fractions" value={72} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('renders label and percentage', () => {
    const { getByText } = render(<SkillBar label="Fractions" value={72} />);
    expect(getByText('Fractions')).toBeTruthy();
    expect(getByText('72%')).toBeTruthy();
  });
});
