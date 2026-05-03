import type { Meta, StoryObj } from '@storybook/react';
import { Tabs } from './Tabs.js';

const meta: Meta<typeof Tabs> = { title: 'Navigation/Tabs', component: Tabs };
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    items: [
      { value: 'all', label: 'All', count: 12, content: <p>All content</p> },
      { value: 'correct', label: 'Correct', count: 8, content: <p>Correct items</p> },
      { value: 'incorrect', label: 'Incorrect', count: 4, content: <p>Incorrect items</p> },
    ],
  },
};
