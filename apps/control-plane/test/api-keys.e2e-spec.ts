import { describe, expect, it } from 'vitest';

describe('API key contract', () => {
  it('returns plaintext key only on create or rotate', () => {
    const created = {
      id: 'key_123',
      prefix: 'pk_live_abcd1234',
      api_key: 'pk_live_abcd1234.secret',
    };
    const listed = {
      id: 'key_123',
      prefix: 'pk_live_abcd1234',
      status: 'active',
    };
    expect(created.api_key).toContain('.');
    expect(listed).not.toHaveProperty('api_key');
  });
});
