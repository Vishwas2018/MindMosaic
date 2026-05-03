import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './Select.js';

const meta: Meta<typeof Select> = { title: 'Forms/Select', component: Select };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: 'naplan', label: 'NAPLAN Y5 Numeracy' },
  { value: 'icas', label: 'ICAS Math Paper C' },
];

export const Default: Story = { args: { label: 'Assessment', options, placeholder: 'Select assessment…' } };
export const WithValue: Story = { args: { label: 'Assessment', options, value: 'naplan' } };
export const WithError: Story = { args: { label: 'Assessment', options, error: 'Please select an assessment.' } };
