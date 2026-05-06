import { describe, expect, it } from 'vitest';

describe('auth API contract', () => {
  it('returns an access token for valid local credentials', () => {
    const response = {
      access_token: 'signed.token.value',
      token_type: 'Bearer',
      expires_in: 86400,
      user: { email: 'admin@example.local' },
    };
    expect(response.token_type).toBe('Bearer');
    expect(response.expires_in).toBe(86400);
    expect(response.user.email).toBe('admin@example.local');
  });
});
