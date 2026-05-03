import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './ProgressBar.js';

const meta: Meta<typeof ProgressBar> = { title: 'Data/ProgressBar', component: ProgressBar };
export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Brand: Story = { args: { value: 65, label: 'Progress' } };
export const Correct: Story = { args: { value: 90, variant: 'correct', label: 'Correct' } };
export const Incorrect: Story = { args: { value: 30, variant: 'incorrect', label: 'Incorrect' } };
export const Warn: Story = { args: { value: 45, variant: 'warn', label: 'Warning' } };
