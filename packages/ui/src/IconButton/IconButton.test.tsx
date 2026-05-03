import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Bell } from 'lucide-react';
import { IconButton } from './IconButton.js';

describe('IconButton', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(
      <IconButton label="Notifications" icon={<Bell size={18} />} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  // X6: 44×44 tap target
  it('has h-11 w-11 class (44px)', () => {
    const { getByRole } = render(
      <IconButton label="Notifications" icon={<Bell size={18} />} />,
    );
    const btn = getByRole('button');
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
  });

  it('aria-label is set', () => {
    const { getByRole } = render(
      <IconButton label="Close menu" icon={<Bell size={18} />} />,
    );
    expect(getByRole('button')).toHaveAttribute('aria-label', 'Close menu');
  });
});
