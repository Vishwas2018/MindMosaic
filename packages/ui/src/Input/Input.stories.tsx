import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input.js';

const meta: Meta<typeof Input> = { title: 'Forms/Input', component: Input };
export default meta;
type Story = StoryObj<typeof Input>;

export const Idle: Story = { args: { label: 'Email address' } };
export const WithValue: Story = { args: { label: 'Email address', defaultValue: 'user@example.com' } };
export const Error: Story = { args: { label: 'Email address', error: 'This email is already in use.' } };
export const Success: Story = { args: { label: 'Email address', success: 'Email verified.' } };
export const Disabled: Story = { args: { label: 'Email address', disabled: true } };
