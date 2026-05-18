// v1.1-S5 — SessionStateDTOSchema is_simulation additive field (ADR-0039 Q-1.1-5.4).
import { describe, it, expect } from 'vitest';
import { SessionStateDTOSchema } from '../session.js';

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

const MINIMAL_ITEM = {
  item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  version: 1,
  stem: { text: 'Question stem' },
  stimulus: null,
  response_type: 'multiple_choice',
  response_config: { options: [{ id: 'a' }, { id: 'b' }] },
  tools_available: [],
  sequence_number: 0,
};

function baseDTO(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    status: 'active',
    engine_type: 'linear',
    mode: 'exam',
    current_item: MINIMAL_ITEM,
    progress: { answered: 0, total: 10, time_remaining_ms: 3600000 },
    navigation: { can_go_back: false, can_skip: false, can_flag: true },
    answered_item_ids: [],
    lock_token: 'lock-token-abc',
    version: 1,
    ...overrides,
  };
}

describe('SessionStateDTOSchema — is_simulation additive field (v1.1-S5)', () => {
  it('accepts is_simulation: true', () => {
    const result = SessionStateDTOSchema.safeParse(baseDTO({ is_simulation: true }));
    expect(result.success).toBe(true);
  });

  it('accepts is_simulation: false', () => {
    const result = SessionStateDTOSchema.safeParse(baseDTO({ is_simulation: false }));
    expect(result.success).toBe(true);
  });

  it('rejects missing is_simulation', () => {
    const result = SessionStateDTOSchema.safeParse(baseDTO());
    expect(result.success).toBe(false);
  });

  it('rejects is_simulation: non-boolean string', () => {
    const result = SessionStateDTOSchema.safeParse(baseDTO({ is_simulation: 'true' }));
    expect(result.success).toBe(false);
  });

  it('is_simulation does not break existing callers that add the field', () => {
    const dto = SessionStateDTOSchema.parse(baseDTO({ is_simulation: false }));
    expect(dto.session_id).toBe(SESSION_ID);
    expect(dto.status).toBe('active');
    expect(dto.is_simulation).toBe(false);
  });
});
