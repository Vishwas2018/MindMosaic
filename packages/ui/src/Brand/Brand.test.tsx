import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
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
    const wrapper = screen.getByRole('generic', { name: 'MindMosaic' });
    expect(wrapper).toBeDefined();
    expect(wrapper.textContent).toContain('Mind');
    expect(wrapper.textContent).toContain('Mosaic');
  });

  it('does not render slogan by default', () => {
    render(<Brand />);
    expect(screen.queryByText(/Turning practice/)).toBeNull();
  });

  it('renders slogan when showSlogan=true', () => {
    render(<Brand showSlogan />);
    expect(screen.getByText('Turning practice into Mastery!')).toBeDefined();
  });

  it('logo img is aria-hidden', () => {
    render(<Brand />);
    const img = document.querySelector('img[aria-hidden="true"]');
    expect(img).not.toBeNull();
  });

  it('forwards ref to root div', () => {
    let ref: HTMLDivElement | null = null;
    render(<Brand ref={(el) => { ref = el; }} />);
    expect(ref).not.toBeNull();
  });
});
