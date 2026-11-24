/** Count-in copy shared by the controls bar and the Settings page. */
import type { CountInBars, CountInMode } from '@/lib/schema';

export const COUNT_IN_BARS_LABELS: Record<CountInBars, string> = {
  0: 'Off',
  1: '1 bar',
  2: '2 bars',
};

export const COUNT_IN_MODE_LABELS: Record<CountInMode, string> = {
  start: 'At the start only',
  every_repeat: 'Before every loop repeat',
};

/** The same choices in a segmented control on the controls bar, where a phone has room for two words each. */
export const COUNT_IN_MODE_SHORT_LABELS: Record<CountInMode, string> = {
  start: 'At the start',
  every_repeat: 'Every repeat',
};
