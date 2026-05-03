import type { Meta, StoryObj } from '@storybook/react';
import { AppShell } from './AppShell.js';

const meta: Meta<typeof AppShell> = {
  title: 'Layout/AppShell',
  component: AppShell,
};
export default meta;
type Story = StoryObj<typeof AppShell>;

export const StudentParent: Story = {
  args: { variant: 'student-parent', children: <p style={{ padding: 24 }}>Student layout</p> },
};

export const Teacher: Story = {
  args: { variant: 'teacher', children: <p style={{ padding: 24 }}>Teacher layout</p> },
};

export const Admin: Story = {
  args: { variant: 'admin', children: <p style={{ padding: 24 }}>Admin layout</p> },
};
