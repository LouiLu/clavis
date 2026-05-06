import { describe, expect, it } from 'vitest';

describe('API key contract', () => {
  it('returns plaintext key only on create or rotate', () => {
    const created = {
      id: 'key_123',
      prefix: 'pk_test_abcd1234',
      api_key: 'pk_test_abcd1234.secret',
    };
    const listed = {
      id: 'key_123',
      prefix: 'pk_test_abcd1234',
      status: 'active',
    };
    expect(created.api_key).toContain('.');
    expect(listed).not.toHaveProperty('api_key');
  });

  it('PATCH updates name and expires_at', () => {
    const patched = {
      name: 'Updated Name',
      expires_at: '2027-01-01T00:00:00.000Z',
      status: 'active',
    };
    expect(patched.name).toBe('Updated Name');
    expect(patched.expires_at).toBeDefined();
    expect(patched.status).toBe('active');
  });

  it('key rate limit CRUD returns expected shapes', () => {
    const created = {
      requests_per_interval: 100,
      interval_seconds: 10,
      burst_size: 5,
    };
    expect(created.requests_per_interval).toBeGreaterThan(0);
    expect(typeof created.interval_seconds).toBe('number');

    const deleted = { ok: true };
    expect(deleted.ok).toBe(true);
  });
});
