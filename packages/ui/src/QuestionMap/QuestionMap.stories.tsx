import type { Meta, StoryObj } from '@storybook/react';
import { QuestionMap, type QuestionMapItem } from './QuestionMap.js';

const meta = {
  title: 'Exam/QuestionMap',
  component: QuestionMap,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof QuestionMap>;

export default meta;
type Story = StoryObj<typeof meta>;

const sample: QuestionMapItem[] = Array.from({ length: 30 }, (_, i) => ({
  number: i + 1,
  sequenceNumber: i,
  status:
    i < 7 ? 'answered' : i === 7 ? 'current' : i === 12 ? 'flagged' : 'unanswered',
  disabled: i > 7,
}));

export const Default: Story = {
  args: {
    items: sample,
    onJump: () => undefined,
  },
};

export const FullyAnswered: Story = {
  args: {
    items: Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      sequenceNumber: i,
      status: i === 5 ? 'current' : 'answered',
    })),
    onJump: () => undefined,
  },
};
