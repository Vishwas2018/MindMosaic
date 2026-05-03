import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { NavLink } from './NavLink.js';

describe('NavLink', () => {
  it('idle state has no serious/critical axe violations', async () => {
    const { container } = render(<nav><NavLink href="#">Dashboard</NavLink></nav>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('active state sets aria-current="page"', () => {
    const { getByRole } = render(<nav><NavLink href="#" active>Dashboard</NavLink></nav>);
    expect(getByRole('link')).toHaveAttribute('aria-current', 'page');
  });
});
