import type { Meta, StoryObj } from '@storybook/react';
import { Brand } from './Brand.js';

const meta: Meta<typeof Brand> = {
  title: 'Brand/Brand',
  component: Brand,
  parameters: { layout: 'centered' },
  args: { size: 'md', variant: 'default', showSlogan: false },
  argTypes: {
    size:       { control: 'radio', options: ['sm', 'md', 'lg'] },
    variant:    { control: 'radio', options: ['default', 'on-dark'] },
    showSlogan: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof Brand>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Large: Story = { args: { size: 'lg' } };

export const WithSlogan: Story = { args: { size: 'lg', showSlogan: true } };

export const OnDark: Story = {
  args: { variant: 'on-dark', size: 'lg', showSlogan: true },
  decorators: [
    (S) => (
      <div
        className="p-8 rounded-xl"
        style={{ background: 'var(--gradient-brand-panel)' }}
      >
        <S />
      </div>
    ),
  ],
};
