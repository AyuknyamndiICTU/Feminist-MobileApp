import type { Translator } from '../i18n';

/** User-facing text for API error codes shared by the payment and activation-code flows. */
export function payErrorText(code: string, t: Translator): string {
  switch (code) {
    case 'rate_limited': return t('pay.error.rate_limited');
    case 'provider_unavailable': return t('pay.error.provider_unavailable');
    case 'network': return t('pay.error.network');
    case 'invalid_msisdn': return t('pay.invalid');
    default: return t('pay.error.generic');
  }
}
