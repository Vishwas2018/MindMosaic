import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs.js';

const items = [
  { label: 'Home', href: '/' },
  { label: 'Students', href: '/students' },
  { label: 'Sarah Johnson' },
];

describe('Breadcrumbs', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<Breadcrumbs items={items} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('last item has aria-current="page"', () => {
    const { getByText } = render(<Breadcrumbs items={items} />);
    expect(getByText('Sarah Johnson')).toHaveAttribute('aria-current', 'page');
  });
});
