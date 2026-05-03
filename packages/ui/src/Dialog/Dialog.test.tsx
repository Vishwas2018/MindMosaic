import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Dialog } from './Dialog.js';

describe('Dialog', () => {
  it('open dialog has no serious/critical axe violations', async () => {
    const { container } = render(
      <Dialog open title="Confirm action" description="This cannot be undone.">
        <p>Are you sure you want to continue?</p>
      </Dialog>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('renders title and description', () => {
    const { getByRole, getByText } = render(
      <Dialog open title="Delete item" description="This is permanent.">
        <p>Content</p>
      </Dialog>,
    );
    expect(getByRole('dialog')).toBeTruthy();
    expect(getByText('Delete item')).toBeTruthy();
    expect(getByText('This is permanent.')).toBeTruthy();
  });
});
