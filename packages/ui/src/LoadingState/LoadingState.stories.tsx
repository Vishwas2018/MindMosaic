import type { Meta, StoryObj } from '@storybook/react';
import { LoadingState } from './LoadingState.js';

const meta: Meta<typeof LoadingState> = { title: 'Layout/LoadingState', component: LoadingState };
export default meta;
type Story = StoryObj<typeof LoadingState>;

export const Card: Story = { args: { variant: 'card' } };
export const Row: Story = { args: { variant: 'row', rows: 3 } };
export const Text: Story = { args: { variant: 'text', rows: 4 } };
export const Avatar: Story = { args: { variant: 'avatar' } };
