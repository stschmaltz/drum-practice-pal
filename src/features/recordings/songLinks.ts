/**
 * Links to a song's recordings (Unit 14): what a pasted link is, the form it
 * is saved in, and what the app may do with it. Pure, with no client import.
 *
 * Every link the app uses goes through `parseSongLink`, a saved row's URL
 * included (`usableLinks`): the video id an embed is built from and the
 * address a link out opens are always the parser's, never text as it was
 * typed or as a row happens to hold it.
 *
 * - YouTube (a watch, short, live or embed address, `youtu.be`, YouTube
 *   Music): saved as `https://www.youtube.com/watch?v=<id>` with `&t=<n>s`
 *   when the link named a start time. Playable in the app.
 * - Spotify (a track address or `spotify:track:` URI): saved as
 *   `https://open.spotify.com/track/<id>`. Always opens Spotify.
 * - Any other `https` address: kept as it is, less the share sheets' tracking
 *   parameters. Opens in a new tab.
 *
 * Anything else is refused with fixed copy (`LINK_REFUSAL_COPY`).
 *
 * A paste with words round the link (a share sheet's "Check out this song:
 * https://…") is taken as its first address (`keptLinkText`), and what a
 * message wraps a link in or puts after it (brackets, quotes, a full stop) is
 * never part of the link (`withoutWrapping`).
 */
import { SONG_LINK_URL_MAX_LENGTH, type SongLinkKind, type SongLinkProvider } from '@/lib/schema';

export interface ParsedLink {
  provider: SongLinkProvider;
  /** The address that is saved and opened: https, normalised. */
  url: string;
  /** The YouTube video's or Spotify track's id; null for any other link. */
  mediaId: string | null;
  /** Where a YouTube link said to start, in whole seconds; null from the beginning. */
  startSeconds: number | null;
  /** Where the link goes, for a button's name: "YouTube", "Spotify" or the host. */
  hostLabel: string;
}

export type LinkRefusal = 'empty' | 'tooLong' | 'notALink' | 'notHttps' | 'signIn' | 'lookAlike';

export type LinkParse = { ok: true; link: ParsedLink } | { ok: false; reason: LinkRefusal };

export const LINK_REFUSAL_COPY: Record<LinkRefusal, string> = {
  empty: 'Paste a link.',
  tooLong: `That link is too long. Keep it to ${SONG_LINK_URL_MAX_LENGTH} characters or fewer.`,
  notALink: "That isn't a link. Paste the address from YouTube, Spotify or the page itself.",
  notHttps: 'Only links that start with https:// can be saved.',
  signIn:
    'That address has a sign-in name or password in it, before an @. Paste the link without them.',
  lookAlike:
    "That address only looks like YouTube or Spotify. Paste the link from the app's own Share button.",
};

/** Domains that are YouTube's or Spotify's own, subdomains included. */
const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];
const SPOTIFY_DOMAINS = ['spotify.com', 'spotify.link'];
/** In a host that is neither's, any of these is a look-alike (`youtube.com.evil.test`). */
const PROVIDER_NAMES = ['youtube', 'youtu.be', 'spotify'];

/** Share sheets add these; none changes what the link opens. `utm_*` goes too. */
const TRACKING_PARAMS = new Set(['si', 'feature', 'pp']);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A start time past this is a typo, not a place in a song. */
const MAX_START_SECONDS = 24 * 60 * 60;

const isHostOf = (host: string, domains: readonly string[]) =>
  domains.some((domain) => host === domain || host.endsWith(`.${domain}`));

/** A host as it is named to the user: "www." says nothing. */
const withoutWww = (host: string) => host.replace(/^www\./, '');

/**
 * The first address among other words, up to the next space: one with its
 * http(s) scheme, or YouTube's or Spotify's own host typed without it
 * ("Song title youtu.be/…"). Any other host needs its scheme to be told from
 * a word with a full stop in it. A bare host counts only at the start of a
 * word (group 1), so "evil.test/youtu.be/…" and "notyoutube.com/…" hold none.
 */
const ADDRESS_IN_TEXT =
  /https?:\/\/\S+|(?:^|[^\w.@/-])((?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be|open\.spotify\.com)\/\S+)/i;

/** What a message opens a link with: a bracket or a quote, never part of an address. */
const OPENING_WRAPPERS = /^[(<[{"'‘“«]+/;
/** What a sentence puts after a link. An address can end in one, but a pasted one never means to. */
const TRAILING_PUNCTUATION = '.,;:!?"\'’”>»';
const OPENING_BRACKET_OF: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const countOf = (text: string, character: string) => text.split(character).length - 1;

/**
 * An address less what a message wrapped it in or put after it: opening
 * brackets and quotes, then from its end sentence punctuation and any closing
 * bracket with no opening bracket of its own inside the address. So
 * "(https://youtu.be/abc)." is the video, and a Wikipedia address keeps the
 * bracket that closes "_(band)".
 */
function withoutWrapping(address: string): string {
  let kept = address.replace(OPENING_WRAPPERS, '');
  for (;;) {
    const last = kept.at(-1);
    if (last === undefined) return kept;
    const opening = OPENING_BRACKET_OF[last];
    const strayBracket = opening !== undefined && countOf(kept, last) > countOf(kept, opening);
    if (!strayBracket && !TRAILING_PUNCTUATION.includes(last)) return kept;
    kept = kept.slice(0, -1);
  }
}

/**
 * A paste with words round its link ("Song title https://youtu.be/…", a share
 * sheet's sentence): the first address in it, less what the sentence wrapped
 * it in. Null when the words hold no address.
 */
function firstAddressIn(text: string): string | null {
  const found = ADDRESS_IN_TEXT.exec(text);
  return found ? withoutWrapping(found[1] ?? found[0]) : null;
}

/**
 * What the form's field shows for what was typed or pasted: the text itself,
 * or, when it has words round a link, only the link, so what will be saved is
 * what is on show. Text that is one unbroken run (someone may still be typing
 * it), or has no address in it, is left exactly as it was.
 */
export function keptLinkText(text: string): string {
  const trimmed = text.trim();
  if (!/\s/.test(trimmed)) return text;
  return firstAddressIn(trimmed) ?? text;
}

/** What a pasted or saved link is, or why it is refused. */
export function parseSongLink(text: string): LinkParse {
  const typed = text.trim();
  if (typed === '') return refused('empty');
  // Words round the link: the link is the first address in them, and without one it is no link.
  const trimmed = /\s/.test(typed) ? firstAddressIn(typed) : withoutWrapping(typed);
  if (trimmed === null || trimmed === '') return refused('notALink');
  if (trimmed.length > SONG_LINK_URL_MAX_LENGTH) return refused('tooLong');

  const spotifyUri = SPOTIFY_URI.exec(trimmed);
  if (spotifyUri?.[1]) return accepted(spotifyTrack(spotifyUri[1]));

  // "youtu.be/abc" pasted without its scheme is still a link; "javascript:…" has one, and is refused below.
  const url = toUrl(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!url) return refused('notALink');
  if (url.protocol !== 'https:') return refused('notHttps');
  // "https://youtube.com@evil.test/" opens evil.test: an address with a sign-in part is never a share link.
  if (url.username !== '' || url.password !== '') return refused('signIn');
  const host = url.hostname.replace(/\.$/, '');
  if (!host.includes('.')) return refused('notALink');

  const youTube = isHostOf(host, YOUTUBE_DOMAINS);
  const spotify = isHostOf(host, SPOTIFY_DOMAINS);
  if (!youTube && !spotify && PROVIDER_NAMES.some((name) => host.includes(name))) {
    return refused('lookAlike');
  }

  if (youTube) {
    const videoId = youTubeVideoId(host, url);
    if (videoId) return accepted(youTubeVideo(videoId, startSecondsOf(url)));
  }
  if (host === 'open.spotify.com') {
    const trackId = spotifyTrackId(url);
    if (trackId) return accepted(spotifyTrack(trackId));
  }

  const plain = withoutTracking(url).href;
  if (plain.length > SONG_LINK_URL_MAX_LENGTH) return refused('tooLong');
  return accepted({
    provider: 'web',
    url: plain,
    mediaId: null,
    startSeconds: null,
    hostLabel: youTube ? 'YouTube' : spotify ? 'Spotify' : withoutWww(host),
  });
}

const refused = (reason: LinkRefusal): LinkParse => ({ ok: false, reason });
const accepted = (link: ParsedLink): LinkParse => ({ ok: true, link });

function toUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function youTubeVideo(videoId: string, startSeconds: number | null): ParsedLink {
  const start = startSeconds === null ? '' : `&t=${startSeconds}s`;
  return {
    provider: 'youtube',
    url: `https://www.youtube.com/watch?v=${videoId}${start}`,
    mediaId: videoId,
    startSeconds,
    hostLabel: 'YouTube',
  };
}

function spotifyTrack(trackId: string): ParsedLink {
  return {
    provider: 'spotify',
    url: `https://open.spotify.com/track/${trackId}`,
    mediaId: trackId,
    startSeconds: null,
    hostLabel: 'Spotify',
  };
}

/** The video a YouTube address names, or null when it names none (a channel, a playlist). */
function youTubeVideoId(host: string, url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  let candidate: string | null | undefined;
  if (isHostOf(host, ['youtu.be'])) candidate = segments[0];
  else if (segments[0] === 'watch') candidate = url.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(segments[0] ?? '')) candidate = segments[1];
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** `t=90`, `t=90s`, `t=1m30s`, `t=1h2m3s` or `start=90`, as whole seconds; null for none or nonsense. */
function startSecondsOf(url: URL): number | null {
  const value = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!value) return null;
  let seconds: number;
  if (/^\d{1,6}s?$/.test(value)) {
    seconds = Number.parseInt(value, 10);
  } else {
    const parts = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?(?:(\d{1,5})s)?$/.exec(value);
    if (!parts) return null;
    seconds = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
  }
  return seconds > 0 && seconds <= MAX_START_SECONDS ? seconds : null;
}

/** `/track/<id>`, with or without Spotify's `/intl-xx` in front. */
function spotifyTrackId(url: URL): string | null {
  const segments = url.pathname.split('/').filter(Boolean);
  if (/^intl-[a-z-]+$/i.test(segments[0] ?? '')) segments.shift();
  const [kind, id] = segments;
  return kind === 'track' && id && SPOTIFY_ID.test(id) ? id : null;
}

function withoutTracking(url: URL): URL {
  const cleaned = new URL(url.href);
  for (const name of [...cleaned.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(name) || name.startsWith('utm_')) cleaned.searchParams.delete(name);
  }
  return cleaned;
}

/**
 * The frame's address for a YouTube link: the no-cookie player, inline on iOS,
 * no other channels' videos at the end. Whatever it is given, the address is
 * that host's `/embed/` and an 11-character id, with these parameters and no
 * others: an id of any other shape gives no address, and a start that isn't
 * whole seconds is left out.
 */
export function youTubeEmbedUrl(link: Pick<ParsedLink, 'mediaId' | 'startSeconds'>): string | null {
  if (!link.mediaId || !YOUTUBE_ID.test(link.mediaId)) return null;
  const { startSeconds } = link;
  const start =
    typeof startSeconds === 'number' && Number.isSafeInteger(startSeconds) && startSeconds > 0
      ? `&start=${startSeconds}`
      : '';
  return `https://www.youtube-nocookie.com/embed/${link.mediaId}?playsinline=1&rel=0${start}`;
}

/** "1:30", "1:02:03": a start time as a player shows it. */
export function startTimeLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/**
 * What the form says a link was recognised as, under its field. `kind` is the
 * field it is in: only a song's Original and Drumless play in the app, so a
 * YouTube video among the other links opens YouTube like any link out.
 */
export function recognisedAs(link: ParsedLink, kind: SongLinkKind = 'original'): string {
  if (link.provider === 'youtube') {
    const start =
      link.startSeconds === null ? '' : `, starting at ${startTimeLabel(link.startSeconds)}`;
    return kind === 'other'
      ? `YouTube video${start}. Opens in YouTube.`
      : `YouTube video${start}. Plays here, with the tab under it.`;
  }
  if (link.provider === 'spotify') {
    return "Spotify track. Opens Spotify, which can't slow a song down: for that, add a YouTube link.";
  }
  return `Link to ${link.hostLabel}. Opens in a new tab.`;
}

/** On the play screen while a video is the source: why the tab's own controls aren't there. */
export const RECORDING_NOTE =
  'The video has its own controls. Switch to Tab for loops, speed and the metronome.';

export const SONG_LINK_KIND_LABELS: Record<SongLinkKind, string> = {
  original: 'Original',
  drumless: 'Drumless',
  other: 'Other',
};

/** A saved link the app can use: its row's id and kind, and what the parser makes of its URL. */
export interface SongLink extends ParsedLink {
  id: string;
  kind: SongLinkKind;
}

interface SavedLink {
  id: string;
  kind: SongLinkKind;
  url: string;
  created_at: string;
}

/** Saved links oldest first, by id among ones saved in the same instant: a total order. */
export function oldestFirst(
  a: Pick<SavedLink, 'id' | 'created_at'>,
  b: Pick<SavedLink, 'id' | 'created_at'>,
): number {
  return (
    Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

const KIND_ORDER: Record<SongLinkKind, number> = { original: 0, drumless: 1, other: 2 };

/**
 * The saved links the app can use, Original first, then Drumless, then the
 * others oldest first. A row whose URL the parser refuses (written by
 * something other than this app) is left out: it is never opened or embedded.
 */
export function usableLinks(rows: readonly SavedLink[]): SongLink[] {
  return [...rows]
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || oldestFirst(a, b))
    .flatMap((row) => {
      const parsed = parseSongLink(row.url);
      return parsed.ok ? [{ ...parsed.link, id: row.id, kind: row.kind }] : [];
    });
}

/** How long an other link's words may be before its path is cut short. */
const OTHER_LINK_LABEL_LENGTH = 40;

/**
 * An other link's words in the song's list: its host and as much of its path
 * as fits ("drumeo.com/beat/lesson…"), not the raw address. The whole address
 * goes in the link's title and accessible name.
 */
export function otherLinkLabel(link: Pick<ParsedLink, 'url'>): string {
  const url = new URL(link.url);
  const host = withoutWww(url.hostname);
  const rest = `${url.pathname}${url.search}${url.hash}`;
  if (rest === '/') return host;
  if (host.length + rest.length <= OTHER_LINK_LABEL_LENGTH) return `${host}${rest}`;
  const room = Math.max(1, OTHER_LINK_LABEL_LENGTH - 1 - host.length);
  return `${host}${rest.slice(0, room)}…`;
}

/** What a recognised link is called among a song's other links; any other site goes by its address. */
const RECOGNISED_LINK_NAMES: Partial<Record<SongLinkProvider, string>> = {
  youtube: 'YouTube video',
  spotify: 'Spotify track',
};

/**
 * The names of a song's other links, in the order given: what the app
 * recognised each as ("YouTube video", "Spotify track"), or its host and the
 * start of its path (`otherLinkLabel`), with a number from the second of any
 * that share a name ("YouTube video 2"). Worked out over the whole list, so a
 * link keeps its number whether the list is folded or not.
 */
export function otherLinkNames(links: readonly Pick<ParsedLink, 'provider' | 'url'>[]): string[] {
  const seen = new Map<string, number>();
  return links.map((link) => {
    const name = RECOGNISED_LINK_NAMES[link.provider] ?? otherLinkLabel(link);
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} ${count}`;
  });
}

/**
 * An other link's accessible name: all of its address, less the scheme every
 * link has, after the name it shows when that name isn't its address
 * ("YouTube video 2: youtube.com/watch?v=…").
 */
export function otherLinkSpokenAs(
  link: Pick<ParsedLink, 'provider' | 'url'>,
  name: string,
): string {
  const address = link.url.replace(/^https:\/\/(www\.)?/, '');
  return RECOGNISED_LINK_NAMES[link.provider] === undefined ? address : `${name}: ${address}`;
}

/** "Original", or "Original on Spotify" for a link that leaves the app. */
export function playAlongLabel(link: Pick<SongLink, 'kind' | 'provider' | 'hostLabel'>): string {
  const kind = SONG_LINK_KIND_LABELS[link.kind];
  return link.provider === 'youtube' ? kind : `${kind} on ${link.hostLabel}`;
}

/** The ways of hearing the whole song on its play screen: the tab's synth, or a video. */
export const RECORDING_SOURCES = ['original', 'drumless'] as const;
export type RecordingSource = (typeof RECORDING_SOURCES)[number];
export type PlaySource = 'tab' | RecordingSource;

export function isRecordingSource(value: string | null): value is RecordingSource {
  return (RECORDING_SOURCES as readonly (string | null)[]).includes(value);
}

/** A link that plays in the app: a YouTube video saved as the song's Original or Drumless. */
export interface VideoSource {
  source: RecordingSource;
  link: SongLink;
  embedUrl: string;
}

/** The song's video sources, Original first. Spotify and other links never play here. */
export function videoSources(links: readonly SongLink[]): VideoSource[] {
  return RECORDING_SOURCES.flatMap((source) => {
    const link = links.find((candidate) => candidate.kind === source);
    if (!link || link.provider !== 'youtube') return [];
    const embedUrl = youTubeEmbedUrl(link);
    return embedUrl ? [{ source, link, embedUrl }] : [];
  });
}

export type SourceChoice =
  /** The tab's player. `dropRequest`: the URL asked for a recording the song doesn't have. */
  | { state: 'tab'; dropRequest: boolean }
  /** Asked for a recording, and the read that would say whether the song has it is on its way. */
  | { state: 'waiting'; source: RecordingSource }
  | { state: 'recording'; video: VideoSource };

/**
 * Which source the play screen shows for the `?source=` it was opened with.
 * A recording the cached links have shows at once. One they lack is settled
 * only on a read made since the page opened (the link may have been added on
 * another device), or when that read failed or can't run; until then the
 * screen waits, so a late answer never takes the tab's player away from
 * someone already playing it.
 */
export function chooseSource(
  requested: string | null,
  links: {
    data: readonly SongLink[] | undefined;
    /** A read is on its way (`fetchStatus === 'fetching'`). */
    fetching: boolean;
    fetchedAfterMount: boolean;
  },
): SourceChoice {
  if (!isRecordingSource(requested)) return { state: 'tab', dropRequest: false };
  const video = videoSources(links.data ?? []).find((candidate) => candidate.source === requested);
  if (video) return { state: 'recording', video };
  if (links.fetching && !links.fetchedAfterMount) return { state: 'waiting', source: requested };
  return { state: 'tab', dropRequest: true };
}
