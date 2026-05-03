import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader } from './PageHeader.js';

const meta: Meta<typeof PageHeader> = { title: 'Layout/PageHeader', component: PageHeader };
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = { args: { title: 'Dashboard' } };

export const WithSubtitle: Story = {
  args: { title: 'Student Dashboard', subtitle: 'Track your progress across all subjects' },
};

export const WithAction: Story = {
  args: { title: 'Assignments', action: <button type="button" style={{ padding: '8px 16px' }}>New</button> },
};
