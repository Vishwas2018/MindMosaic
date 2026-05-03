import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { TextArea } from './TextArea.js';

describe('TextArea', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <form><TextArea label="Your answer" placeholder="Type here…" /></form>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('error state sets aria-invalid', () => {
    const { getByRole } = render(
      <form><TextArea label="Your answer" error="Answer is required." /></form>,
    );
    expect(getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
