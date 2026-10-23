import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { utf8Decode, utf8Encode } from '../lib/utf8';

export interface Cipher {
  encrypt(plain: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
}

const DEVICE_KEY = 'nis_dek_v1';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Device-bound key storage: hardware-backed keystore on Android/iOS; localStorage on the web demo only. */
export const keyVault = {
  async get(name: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(name) ?? null;
    return SecureStore.getItemAsync(name, SECURE_OPTS);
  },
  async set(name: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(name, value); return; }
    await SecureStore.setItemAsync(name, value, SECURE_OPTS);
  },
  async remove(name: string): Promise<void> {
    if (Platform.OS === 'web') { globalThis.localStorage?.removeItem(name); return; }
    await SecureStore.deleteItemAsync(name, SECURE_OPTS);
  },
};

/** AES-256-GCM cipher whose data-encryption key never leaves the device keystore. */
export async function createDeviceCipher(keyName: string = DEVICE_KEY): Promise<Cipher> {
  let hex = await keyVault.get(keyName);
  let key: AESEncryptionKey;
  if (hex) {
    key = await AESEncryptionKey.import(hex, 'hex');
  } else {
    key = await AESEncryptionKey.generate();
    hex = await key.encoded('hex');
    await keyVault.set(keyName, hex);
  }
  return {
    async encrypt(plain) {
      const sealed = await aesEncryptAsync(utf8Encode(plain), key);
      return sealed.combined('base64');
    },
    async decrypt(b64) {
      const bytes = await aesDecryptAsync(AESSealedData.fromCombined(b64), key);
      return utf8Decode(bytes);
    },
  };
}

/** Crypto-erasure: once the key is gone, any ciphertext left in flash storage is unreadable. */
export async function destroyDeviceKey(): Promise<void> {
  await keyVault.remove(DEVICE_KEY);
}
