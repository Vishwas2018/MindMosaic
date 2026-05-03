import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { AppShell } from './AppShell.js';

describe('AppShell', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <AppShell variant="student-parent">
        <main><p>Content</p></main>
      </AppShell>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
