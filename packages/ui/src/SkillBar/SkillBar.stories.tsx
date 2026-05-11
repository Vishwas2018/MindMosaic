import type { Meta, StoryObj } from '@storybook/react';
import { SkillBar } from './SkillBar.js';

const meta: Meta<typeof SkillBar> = { title: 'Data/SkillBar', component: SkillBar };
export default meta;
type Story = StoryObj<typeof SkillBar>;

export const Default: Story = { args: { label: 'Fractions', value: 72 } };
export const Low: Story = { args: { label: 'Geometry', value: 25, variant: 'incorrect' } };
export const Horizontal: Story = { args: { label: 'Numeracy', value: 68, layout: 'horizontal' } };
