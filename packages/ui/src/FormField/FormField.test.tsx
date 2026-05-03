import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { FormField } from './FormField.js';

describe('FormField', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <form><FormField label="Email address" hint="We'll never share this." /></form>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('error state has no violations', async () => {
    const { container } = render(
      <form><FormField label="Email" error="Please enter a valid email." /></form>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
