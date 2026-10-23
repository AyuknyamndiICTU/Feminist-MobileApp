import type { Cipher } from './crypto';
import type { KeyValueStore } from './storage';

/** JSON document store where every value is sealed with AES-GCM before touching disk. */
export class EncryptedStore {
  constructor(
    private readonly raw: KeyValueStore,
    private readonly cipher: Cipher,
    private readonly prefix: string,
  ) {}

  async get<T>(name: string, fallback: T): Promise<T> {
    const sealed = await this.raw.getItem(this.prefix + name);
    if (sealed === null) return fallback;
    return JSON.parse(await this.cipher.decrypt(sealed)) as T;
  }

  async set<T>(name: string, value: T): Promise<void> {
    await this.raw.setItem(this.prefix + name, await this.cipher.encrypt(JSON.stringify(value)));
  }

  async clearAll(): Promise<void> {
    const keys = await this.raw.getAllKeys();
    await Promise.all(keys.filter((k) => k.startsWith(this.prefix)).map((k) => this.raw.removeItem(k)));
  }
}
