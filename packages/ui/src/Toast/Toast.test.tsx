import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { ToastProvider } from './Toast.js';

describe('ToastProvider', () => {
  it('has no serious/critical axe violations when empty', async () => {
    const { container } = render(
      <ToastProvider>
        <main><p>App content</p></main>
      </ToastProvider>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
