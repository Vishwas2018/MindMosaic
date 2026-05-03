import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './Tooltip.js';

const meta: Meta<typeof Tooltip> = { title: 'Overlay/Tooltip', component: Tooltip };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: 'Helpful information',
    children: <button type="button" style={{ padding: '8px 16px' }}>Hover me</button>,
  },
};

export const Bottom: Story = {
  args: {
    content: 'Opens below',
    side: 'bottom',
    children: <button type="button" style={{ padding: '8px 16px' }}>Hover me</button>,
  },
};
