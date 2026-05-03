import type { Meta, StoryObj } from '@storybook/react';
import { TextArea } from './TextArea.js';

const meta: Meta<typeof TextArea> = { title: 'Forms/TextArea', component: TextArea };
export default meta;
type Story = StoryObj<typeof TextArea>;

export const Default: Story = { args: { label: 'Your answer', placeholder: 'Type here…' } };
export const WithError: Story = { args: { label: 'Your answer', error: 'Answer is required.' } };
export const WithHint: Story = { args: { label: 'Your answer', hint: 'Minimum 50 characters.' } };
export const Disabled: Story = { args: { label: 'Your answer', disabled: true } };
