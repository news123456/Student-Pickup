import bcrypt from 'bcryptjs';
import { argon2Encrypt, argon2Verify, Argon2Options } from 'argon2-browser';

// BCRYPT wrapper
export function hashBcrypt(data: string, saltRounds: number = 10): string {
  const salt = bcrypt.genSaltSync(saltRounds);
  return bcrypt.hashSync(data, salt);
}

export function verifyBcrypt(data: string, hash: string): boolean {
  return bcrypt.compareSync(data, hash);
}

// ARGON2 wrapper
export async function hashArgon2(data: string): Promise<string> {
  const result = await argon2Encrypt({
    pass: data,
    salt: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), // In production, generate a real random salt!
    type: 2, // Argon2id
  });
  return result.encoded;
}

export async function verifyArgon2(data: string, hash: string): Promise<boolean> {
  return await argon2Verify({
    pass: data,
    encoded: hash,
  });
}
