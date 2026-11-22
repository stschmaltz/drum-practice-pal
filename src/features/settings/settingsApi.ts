/**
 * Supabase calls for user_settings. Plain async functions that throw on error;
 * the hooks in useSettings.ts are the only callers.
 */
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/supabaseResult';
import { SETTINGS_SELECT, type Settings } from './settingsForm';

export async function fetchSettings(userId: string): Promise<Settings> {
  return unwrap(
    await supabase.from('user_settings').select(SETTINGS_SELECT).eq('user_id', userId).single(),
    'settings',
  );
}

/** Returns the saved row, so the cache holds what the DB actually stored. */
export async function updateSettings(
  userId: string,
  changes: Partial<Settings>,
): Promise<Settings> {
  return unwrap(
    await supabase
      .from('user_settings')
      .update(changes)
      .eq('user_id', userId)
      .select(SETTINGS_SELECT)
      .single(),
    'settings',
  );
}
