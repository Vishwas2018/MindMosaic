import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { TopBar } from './TopBar.js';

describe('TopBar', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <TopBar><span>MindMosaic</span></TopBar>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
