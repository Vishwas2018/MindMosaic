import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox.js';

const meta: Meta<typeof Checkbox> = { title: 'Forms/Checkbox', component: Checkbox };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = { args: { label: 'I agree to the terms' } };
export const Checked: Story = { args: { label: 'I agree to the terms', checked: true } };
export const Indeterminate: Story = { args: { label: 'Select all', indeterminate: true } };
export const Disabled: Story = { args: { label: 'Disabled option', disabled: true } };
