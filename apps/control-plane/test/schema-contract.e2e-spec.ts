import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('schema contract', () => {
  const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');

  it('defines API keys, rate limits, and audit logs', () => {
    expect(schema).toContain('model ApiKey');
    expect(schema).toContain('model RateLimitPolicy');
    expect(schema).toContain('model AuditLog');
  });
});
