import * as argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service';

describe('PasswordService', () => {
  it('accepts a matching Argon2 hash', async () => {
    const hash = await argon2.hash('ChangeMe123!');
    await expect(new PasswordService().verify(hash, 'ChangeMe123!')).resolves.toBeUndefined();
  });
});
