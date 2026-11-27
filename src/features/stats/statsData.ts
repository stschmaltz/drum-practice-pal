import type { PracticeLoop } from '@/features/loops/practiceList';
import type { PracticeSession } from '@/features/practice/sessions';

/** What every section of the Stats page is worked out from: the user's sessions, and their loops with their songs. */
export interface StatsData {
  sessions: readonly PracticeSession[];
  loops: readonly PracticeLoop[];
}
