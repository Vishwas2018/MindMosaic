import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.js';

describe('ErrorBoundary', () => {
  it('renders children normally and has no violations', async () => {
    const { container } = render(
      <ErrorBoundary><p>Hello</p></ErrorBoundary>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
