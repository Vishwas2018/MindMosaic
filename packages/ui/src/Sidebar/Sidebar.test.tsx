import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Sidebar } from './Sidebar.js';

describe('Sidebar', () => {
  it('teacher variant has no serious/critical axe violations', async () => {
    const { container } = render(<Sidebar variant="teacher"><nav><a href="#">Dashboard</a></nav></Sidebar>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('admin variant has no serious/critical axe violations', async () => {
    const { container } = render(<Sidebar variant="admin"><nav><a href="#">Jobs</a></nav></Sidebar>);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
