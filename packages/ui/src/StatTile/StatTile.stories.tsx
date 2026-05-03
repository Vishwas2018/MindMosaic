import type { Meta, StoryObj } from '@storybook/react';
import { StatTile } from './StatTile.js';

const meta: Meta<typeof StatTile> = { title: 'Data/StatTile', component: StatTile };
export default meta;
type Story = StoryObj<typeof StatTile>;

export const Neutral: Story = { args: { label: 'Total sessions', value: 24 } };
export const Positive: Story = { args: { label: 'Accuracy', value: '87%', trend: '+5% this week', sentiment: 'positive' } };
export const Negative: Story = { args: { label: 'Missed questions', value: 6, trend: '+2 this week', sentiment: 'negative' } };
export const Loading: Story = { args: { label: 'Score', value: 0, loading: true } };
