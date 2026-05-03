import type { Meta, StoryObj } from '@storybook/react';
import { FormField } from './FormField.js';

const meta: Meta<typeof FormField> = { title: 'Forms/FormField', component: FormField };
export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = { args: { label: 'Email address' } };
export const WithHint: Story = { args: { label: 'Password', hint: 'Must be at least 8 characters.' } };
export const WithError: Story = { args: { label: 'Email', error: 'Please enter a valid email.' } };
