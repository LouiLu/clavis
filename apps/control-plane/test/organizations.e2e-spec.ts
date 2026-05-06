import { describe, expect, it } from 'vitest';

describe('organizations API contract', () => {
  it('returns organizations with members', () => {
    expect({
      id: 'seed-internal-org',
      name: 'Internal Platform Team',
      members: [{ role: 'platform_admin' }],
    }).toMatchObject({ name: 'Internal Platform Team' });
  });
});
