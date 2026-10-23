import type { Lang } from '../domain/types';
import { en, type TKey } from './en';
import { fr } from './fr';

const DICTS: Record<Lang, Record<TKey, string>> = { en, fr };

export type Translator = (key: TKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): Translator {
  return (key, vars) => {
    let s: string = DICTS[lang][key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

export type { TKey };
