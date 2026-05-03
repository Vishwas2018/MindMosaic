import type { Meta, StoryObj } from '@storybook/react';
import { TopBar } from './TopBar.js';

const meta: Meta<typeof TopBar> = { title: 'Layout/TopBar', component: TopBar };
export default meta;
type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  args: { children: <><span style={{ fontWeight: 600 }}>MindMosaic</span><span style={{ marginLeft: 'auto' }}>User</span></> },
};
