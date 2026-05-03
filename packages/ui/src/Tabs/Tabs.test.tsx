import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect } from 'vitest';
import { Tabs } from './Tabs.js';

const items = [
  { value: 'a', label: 'Tab A', content: <p>Content A</p> },
  { value: 'b', label: 'Tab B', content: <p>Content B</p> },
];

describe('Tabs', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<Tabs items={items} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });
});
