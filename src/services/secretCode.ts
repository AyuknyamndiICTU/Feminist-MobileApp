/**
 * The secret code only reveals the hidden interface; it is a disguise, not the data-protection
 * boundary. Data stays protected by the keystore-bound AES key even if the code is guessed.
 */
import * as Crypto from 'expo-crypto';

import { keyVault } from './crypto';

const NAME = 'nis_code_v1';

async function hash(salt: string, code: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${code}`);
}

export async function hasSecretCode(): Promise<boolean> {
  return (await keyVault.get(NAME)) !== null;
}

export async function setSecretCode(code: string): Promise<void> {
  const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
  await keyVault.set(NAME, JSON.stringify({ salt, hash: await hash(salt, code) }));
}

export async function verifySecretCode(code: string): Promise<boolean> {
  const stored = await keyVault.get(NAME);
  if (!stored) return false;
  const { salt, hash: expected } = JSON.parse(stored) as { salt: string; hash: string };
  return (await hash(salt, code)) === expected;
}

export async function clearSecretCode(): Promise<void> {
  await keyVault.remove(NAME);
}
