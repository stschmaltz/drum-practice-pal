import { useSyncExternalStore } from 'react';
import { readCharacterKeysOn, subscribeCharacterKeys } from './characterKeysPreference';

/** This device's "Single-letter shortcuts" switch, redrawn when it changes here or in another tab. */
export function useCharacterKeysOn(): boolean {
  return useSyncExternalStore(subscribeCharacterKeys, readCharacterKeysOn);
}
