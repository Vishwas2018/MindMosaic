import { render, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, it, expect, vi } from 'vitest';
import { QuestionMap, type QuestionMapItem } from './QuestionMap.js';

const items: QuestionMapItem[] = [
  { number: 1, sequenceNumber: 0, status: 'answered' },
  { number: 2, sequenceNumber: 1, status: 'current' },
  { number: 3, sequenceNumber: 2, status: 'flagged' },
  { number: 4, sequenceNumber: 3, status: 'unanswered' },
  { number: 5, sequenceNumber: 4, status: 'unanswered', disabled: true },
];

describe('QuestionMap', () => {
  it('has no serious/critical axe violations', async () => {
    const { container } = render(<QuestionMap items={items} onJump={() => undefined} />);
    const results = await axe(container);
    expect(results).toHaveNoSeriousViolations();
  });

  it('marks the current item with aria-current="step"', () => {
    const { getByRole } = render(<QuestionMap items={items} onJump={() => undefined} />);
    const current = getByRole('button', { current: 'step' });
    expect(current.textContent).toBe('2');
  });

  it('exposes disabled cells with aria-disabled="true" and does not invoke onJump', () => {
    const onJump = vi.fn();
    const { getByLabelText } = render(<QuestionMap items={items} onJump={onJump} />);
    const disabled = getByLabelText(/Question 5,.*not yet available/i);
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(disabled);
    expect(onJump).not.toHaveBeenCalled();
  });

  it('invokes onJump for an enabled cell click', () => {
    const onJump = vi.fn();
    const { getByLabelText } = render(<QuestionMap items={items} onJump={onJump} />);
    const cell = getByLabelText(/Question 4, unanswered/i);
    fireEvent.click(cell);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump.mock.calls[0]?.[0]).toEqual(items[3]);
  });
});
