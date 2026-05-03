import type { Meta, StoryObj } from '@storybook/react';
import { RadioGroup } from './RadioGroup.js';

const meta: Meta<typeof RadioGroup> = { title: 'Forms/RadioGroup', component: RadioGroup };
export default meta;
type Story = StoryObj<typeof RadioGroup>;

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

export const Default: Story = { args: { label: 'Choose an option', options } };
export const WithDefault: Story = { args: { label: 'Choose an option', options, defaultValue: 'b' } };
