import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './EmptyState.js';

const meta: Meta<typeof EmptyState> = { title: 'Layout/EmptyState', component: EmptyState };
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = { args: { title: 'No sessions yet' } };
export const WithDescription: Story = {
  args: { title: 'No assignments', description: 'Start a practice session to keep learning.' },
};
export const WithCTA: Story = {
  args: {
    title: 'No sessions yet',
    description: 'Begin your first practice session.',
    action: <button type="button" style={{ padding: '8px 16px' }}>Start session</button>,
  },
};
