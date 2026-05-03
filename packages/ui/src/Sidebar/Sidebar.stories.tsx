import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from './Sidebar.js';

const meta: Meta<typeof Sidebar> = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  decorators: [(Story) => <div style={{ display: 'flex', height: '100vh' }}><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Teacher: Story = {
  args: { variant: 'teacher', children: <nav><p style={{ padding: 16 }}>Teacher nav</p></nav> },
};

export const Admin: Story = {
  args: { variant: 'admin', children: <nav><p style={{ padding: 16, color: '#D5D9E2' }}>Admin nav</p></nav> },
};
