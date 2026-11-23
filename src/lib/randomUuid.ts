import { toHex } from './hex';

/**
 * A version 4 UUID for ids the client chooses (song ids now, practice session
 * ids in Unit 09). crypto.randomUUID only exists in secure contexts, so a phone
 * on the LAN dev server would lose it; getRandomValues works everywhere.
 */
export function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for any UUID-shaped string. Ids from a URL are checked first, since Postgres rejects a malformed uuid with an error rather than no rows. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
