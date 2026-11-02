/**
 * Renewal reminders as local notifications (no server push). They appear under the disguise app
 * name and only mention "your plan", so they reveal nothing if someone else sees the phone.
 */
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { CONFIG } from '../config';
import { reminderSchedule } from '../domain/subscription';
import type { Lang } from '../domain/types';
import { withoutAutoLock } from '../lib/autoLock';

const CHANNEL = 'calc-reminders';
const KIND = 'renewal';

const TEXT: Record<Lang, (daysLeft: number) => string> = {
  en: (d) =>
    d === 0 ? 'Your plan has ended. Open the app to renew it.'
      : d === 1 ? 'Your plan ends tomorrow. Open the app to renew it.'
        : `Your plan ends in ${d} days. Open the app to renew it.`,
  fr: (d) =>
    d === 0 ? 'Votre forfait est terminé. Ouvrez l’application pour le renouveler.'
      : d === 1 ? 'Votre forfait se termine demain. Ouvrez l’application pour le renouveler.'
        : `Votre forfait se termine dans ${d} jours. Ouvrez l’application pour le renouveler.`,
};

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await withoutAutoLock(() => Notifications.requestPermissionsAsync());
  return asked.granted;
}

async function cancelRenewalReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Replaces any previous reminders with ones for this expiry (3 days, 1 day before, and at the end). */
export async function scheduleRenewalReminders(expiresAt: number | undefined, lang: Lang, askPermission: boolean): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await cancelRenewalReminders();
    if (!expiresAt) return;
    const times = reminderSchedule(expiresAt, Date.now(), CONFIG.subscription.remindDaysBefore);
    if (times.length === 0) return;
    const allowed = askPermission ? await ensurePermission() : (await Notifications.getPermissionsAsync()).granted;
    if (!allowed) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: lang === 'fr' ? 'Rappels' : 'Reminders',
        importance: AndroidImportance.DEFAULT,
        showBadge: false,
      });
    }
    for (const r of times) {
      await Notifications.scheduleNotificationAsync({
        content: { body: TEXT[lang](r.daysLeft), data: { kind: KIND } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
      });
    }
  } catch {
    // Reminders are a convenience; the in-app banner and renewal dialog still appear.
  }
}
