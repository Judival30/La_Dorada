import { hash, verify } from '@node-rs/argon2';

/** Hashes a password with Argon2id (the library default) and its default cost parameters. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Verifies `plain` against an Argon2 PHC hash. A malformed hash yields `false`. */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await verify(hash, plain);
  } catch {
    return false;
  }
}
