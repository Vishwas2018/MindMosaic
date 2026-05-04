import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

// next/image expects a Next runtime; in jsdom we render it as a plain <img>.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { priority, unoptimized, ...rest } = props as {
      priority?: boolean;
      unoptimized?: boolean;
    };
    void priority;
    void unoptimized;
    return <img {...(rest as Record<string, unknown>)} alt={(rest as { alt?: string }).alt ?? ''} />;
  },
}));

import { Brand } from './Brand.js';

describe('Brand — axe', () => {
  it('default has no serious violations', async () => {
    const { container } = render(<Brand />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('on-dark with slogan has no serious violations', async () => {
    const { container } = render(
      <div style={{ background: '#4A2BBA' }}>
        <Brand variant="on-dark" showSlogan size="lg" />
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});

describe('Brand — functional', () => {
  it('renders Mind + Mosaic wordmark', () => {
    render(<Brand />);
    const root = screen.getByRole('img', { name: 'MindMosaic' });
    expect(root).toBeDefined();
    expect(root.textContent).toContain('Mind');
    expect(root.textContent).toContain('Mosaic');
  });

  it('does not render slogan by default', () => {
    render(<Brand />);
    expect(screen.queryByText(/Turning practice/)).toBeNull();
  });

  it('renders slogan when showSlogan=true', () => {
    render(<Brand showSlogan />);
    expect(screen.getByText('Turning practice into mastery')).toBeDefined();
  });

  it('logo img is decorative (alt empty + aria-hidden)', () => {
    render(<Brand />);
    const img = document.querySelector('img[aria-hidden="true"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('renders all three sizes without error', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount } = render(<Brand size={size} />);
      expect(screen.getByRole('img', { name: 'MindMosaic' })).toBeDefined();
      unmount();
    }
  });

  it('on-dark variant still renders Mind + Mosaic text', () => {
    render(<Brand variant="on-dark" />);
    const root = screen.getByRole('img', { name: 'MindMosaic' });
    expect(root.textContent).toContain('Mind');
    expect(root.textContent).toContain('Mosaic');
  });

  it('forwards ref to root div', () => {
    let ref: HTMLDivElement | null = null;
    render(<Brand ref={(el) => { ref = el; }} />);
    expect(ref).not.toBeNull();
  });
});
