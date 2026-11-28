import { SONG_LINK_URL_MAX_LENGTH } from '@/lib/schema';
import {
  chooseSource,
  LINK_REFUSAL_COPY,
  parseSongLink,
  playAlongLabel,
  recognisedAs,
  startTimeLabel,
  usableLinks,
  videoSources,
  youTubeEmbedUrl,
  type LinkRefusal,
  type ParsedLink,
  type SongLink,
} from './songLinks';

const VIDEO = 'dQw4w9WgXcQ';
const TRACK = '4uLU6hMCjMI75M1A2tKUQC';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const SPOTIFY = `https://open.spotify.com/track/${TRACK}`;

function accepted(text: string): ParsedLink {
  const parsed = parseSongLink(text);
  if (!parsed.ok) throw new Error(`refused as ${parsed.reason}: ${text}`);
  return parsed.link;
}

function refusal(text: string): LinkRefusal | null {
  const parsed = parseSongLink(text);
  return parsed.ok ? null : parsed.reason;
}

describe('parseSongLink: YouTube', () => {
  it.each([
    ['a watch address', `https://www.youtube.com/watch?v=${VIDEO}`],
    ['without www', `https://youtube.com/watch?v=${VIDEO}`],
    ['the mobile site', `https://m.youtube.com/watch?v=${VIDEO}`],
    ['YouTube Music', `https://music.youtube.com/watch?v=${VIDEO}&feature=share`],
    ['a short link', `https://youtu.be/${VIDEO}`],
    ['a short link from the share sheet', `https://youtu.be/${VIDEO}?si=AbCdEf123456`],
    ['a Short', `https://www.youtube.com/shorts/${VIDEO}`],
    ['a Short with a share parameter', `https://youtube.com/shorts/${VIDEO}?feature=share`],
    ['a live video', `https://www.youtube.com/live/${VIDEO}?si=xyz`],
    ['an embed address', `https://www.youtube.com/embed/${VIDEO}`],
    ['a no-cookie embed address', `https://www.youtube-nocookie.com/embed/${VIDEO}?rel=0`],
    ['the old /v/ form', `https://www.youtube.com/v/${VIDEO}`],
    ['v after other parameters', `https://www.youtube.com/watch?app=desktop&v=${VIDEO}`],
    ['inside a playlist', `https://www.youtube.com/watch?v=${VIDEO}&list=PL123&index=4`],
    ['with tracking', `https://www.youtube.com/watch?v=${VIDEO}&pp=ygUE&utm_source=x&si=abc`],
    ['pasted without its scheme', `youtu.be/${VIDEO}`],
    ['with spaces round it', `  https://youtu.be/${VIDEO}\n`],
    ['a host in capitals', `https://WWW.YouTube.com/watch?v=${VIDEO}`],
    ['a host with its root dot', `https://www.youtube.com./watch?v=${VIDEO}`],
  ])('takes %s', (_name, text) => {
    expect(accepted(text)).toEqual({
      provider: 'youtube',
      url: WATCH,
      mediaId: VIDEO,
      startSeconds: null,
      hostLabel: 'YouTube',
    });
  });

  it.each([
    ['t=90', 90],
    ['t=90s', 90],
    ['t=1m30s', 90],
    ['t=1h2m3s', 3723],
    ['t=2m', 120],
    ['start=45', 45],
  ])('keeps a start time given as %s', (param, seconds) => {
    const link = accepted(`https://www.youtube.com/watch?v=${VIDEO}&${param}`);
    expect(link.startSeconds).toBe(seconds);
    expect(link.url).toBe(`${WATCH}&t=${seconds}s`);
  });

  it('keeps the start time of a short link', () => {
    expect(accepted(`https://youtu.be/${VIDEO}?si=abc&t=75`).url).toBe(`${WATCH}&t=75s`);
  });

  it.each(['t=0', 't=abc', 't=-5', 't=1x', 't=999999999', 't=', 't=1.5'])(
    'drops the start time %s, keeping the video',
    (param) => {
      expect(accepted(`https://www.youtube.com/watch?v=${VIDEO}&${param}`).url).toBe(WATCH);
    },
  );

  it.each([
    ['a channel', 'https://www.youtube.com/@somedrummer'],
    ['a playlist', 'https://www.youtube.com/playlist?list=PL123'],
    ['a video id of the wrong length', 'https://www.youtube.com/watch?v=short'],
    ['a video id with other characters', 'https://www.youtube.com/watch?v=dQw4w9WgX<Q'],
  ])('keeps %s as a plain link to YouTube, which never plays here', (_name, text) => {
    const link = accepted(text);
    expect(link).toMatchObject({ provider: 'web', mediaId: null, hostLabel: 'YouTube' });
    expect(youTubeEmbedUrl(link)).toBeNull();
  });

  it('saves a form it reads back as the same link', () => {
    const saved = accepted(`https://youtu.be/${VIDEO}?si=abc&t=1m5s`);
    expect(accepted(saved.url)).toEqual(saved);
  });
});

describe('parseSongLink: Spotify', () => {
  it.each([
    ['a track address', `https://open.spotify.com/track/${TRACK}`],
    ['from the share sheet', `https://open.spotify.com/track/${TRACK}?si=0123456789abcdef`],
    ['with a language segment', `https://open.spotify.com/intl-de/track/${TRACK}?si=abc`],
    ['with a longer language segment', `https://open.spotify.com/intl-pt-BR/track/${TRACK}`],
    ['a Spotify URI', `spotify:track:${TRACK}`],
    ['without its scheme', `open.spotify.com/track/${TRACK}`],
  ])('takes %s', (_name, text) => {
    expect(accepted(text)).toEqual({
      provider: 'spotify',
      url: SPOTIFY,
      mediaId: TRACK,
      startSeconds: null,
      hostLabel: 'Spotify',
    });
  });

  it.each([
    ['an album', 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3'],
    ['a short share link', 'https://spotify.link/AbCdEf'],
    ['a track id of the wrong length', 'https://open.spotify.com/track/tooshort'],
  ])('keeps %s as a plain link to Spotify', (_name, text) => {
    expect(accepted(text)).toMatchObject({ provider: 'web', mediaId: null, hostLabel: 'Spotify' });
  });

  it('refuses a Spotify URI that names no track', () => {
    expect(refusal('spotify:album:1DFixLWuPkv3KT3TnV35m3')).toBe('notHttps');
  });
});

describe('parseSongLink: any other link', () => {
  it('keeps an https address as it is, named by its host', () => {
    expect(accepted('https://www.drumeo.com/beat/lesson?id=7#part-2')).toEqual({
      provider: 'web',
      url: 'https://www.drumeo.com/beat/lesson?id=7#part-2',
      mediaId: null,
      startSeconds: null,
      hostLabel: 'drumeo.com',
    });
  });

  it('drops the share sheets’ tracking parameters and keeps the rest', () => {
    expect(
      accepted('https://example.com/lesson?utm_source=a&utm_medium=b&si=c&feature=d&pp=e&page=2')
        .url,
    ).toBe('https://example.com/lesson?page=2');
  });

  it('takes a host pasted without a scheme', () => {
    expect(accepted('example.com/cover').url).toBe('https://example.com/cover');
  });

  it('takes an address exactly as long as the database takes', () => {
    const url = `https://example.com/${'a'.repeat(SONG_LINK_URL_MAX_LENGTH - 20)}`;
    expect(url).toHaveLength(SONG_LINK_URL_MAX_LENGTH);
    expect(accepted(url).url).toBe(url);
  });
});

describe('parseSongLink: refusals', () => {
  it.each<[string, string, LinkRefusal]>([
    ['nothing', '', 'empty'],
    ['only spaces', '  \n ', 'empty'],
    ['a 3000-character address', `https://example.com/${'a'.repeat(3000)}`, 'tooLong'],
    ['one character too many', `https://example.com/${'a'.repeat(2029)}`, 'tooLong'],
    ['a javascript: address', 'javascript:alert(1)', 'notHttps'],
    ['a javascript: address in capitals', 'JaVaScRiPt:alert(document.cookie)', 'notHttps'],
    ['a data: address', 'data:text/html,<script>alert(1)</script>', 'notHttps'],
    ['a blob: address', 'blob:https://example.com/123', 'notHttps'],
    ['a file: address', 'file:///etc/passwd', 'notHttps'],
    ['an http: address', `http://www.youtube.com/watch?v=${VIDEO}`, 'notHttps'],
    ['an ftp: address', 'ftp://example.com/song.mp3', 'notHttps'],
    ['a vbscript: address', 'vbscript:msgbox(1)', 'notHttps'],
    ['a word', 'hello', 'notALink'],
    ['a sentence', 'the one from the lesson', 'notALink'],
    ['two links', `https://youtu.be/${VIDEO} https://youtu.be/${VIDEO}`, 'notALink'],
    ['an address with a space inside', 'https://example.com/a b', 'notALink'],
    ['a scheme and nothing else', 'https://', 'notALink'],
    ['a host with no dot', 'https://localhost/x', 'notALink'],
    ['a look-alike host', `https://youtube.com.evil.test/watch?v=${VIDEO}`, 'lookAlike'],
    ['a look-alike with www', `https://www.youtube.com.evil.test/watch?v=${VIDEO}`, 'lookAlike'],
    ['a look-alike short host', `https://youtu.be.evil.test/${VIDEO}`, 'lookAlike'],
    ['a look-alike Spotify host', `https://open.spotify.com.evil.test/track/${TRACK}`, 'lookAlike'],
    ['a host that only contains the name', 'https://youtube-login.test/watch', 'lookAlike'],
    ['a host that ends in the name', `https://notyoutube.com/watch?v=${VIDEO}`, 'lookAlike'],
    [
      'a sign-in part before the host',
      `https://youtube.com@evil.test/watch?v=${VIDEO}`,
      'lookAlike',
    ],
    ['a sign-in part with a password', 'https://user:pass@example.com/', 'lookAlike'],
  ])('refuses %s', (_name, text, reason) => {
    expect(refusal(text)).toBe(reason);
  });

  it('has fixed copy for every refusal, none of it the text that was typed', () => {
    for (const copy of Object.values(LINK_REFUSAL_COPY)) {
      expect(copy).toMatch(/\.$/);
      expect(copy).not.toContain('evil');
    }
  });
});

describe('youTubeEmbedUrl', () => {
  it('is the no-cookie player, inline, with no related videos', () => {
    expect(youTubeEmbedUrl(accepted(WATCH))).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}?playsinline=1&rel=0`,
    );
  });

  it('carries the start time', () => {
    expect(youTubeEmbedUrl(accepted(`${WATCH}&t=90s`))).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}?playsinline=1&rel=0&start=90`,
    );
  });

  it.each([null, '', 'short', `${VIDEO}"onload="x`, `${VIDEO}/../x`])(
    'gives nothing for the id %j',
    (mediaId) => {
      expect(youTubeEmbedUrl({ mediaId, startSeconds: null })).toBeNull();
    },
  );
});

describe('labels', () => {
  it.each([
    [59, '0:59'],
    [90, '1:30'],
    [3723, '1:02:03'],
  ])('shows %i seconds as %s', (seconds, label) => {
    expect(startTimeLabel(seconds)).toBe(label);
  });

  it('says what each kind of link was recognised as', () => {
    expect(recognisedAs(accepted(`${WATCH}&t=90`))).toBe(
      'YouTube video, starting at 1:30. Plays here, with the tab under it.',
    );
    expect(recognisedAs(accepted(SPOTIFY))).toContain("can't slow a song down");
    expect(recognisedAs(accepted('https://example.com/x'))).toBe(
      'Link to example.com. Opens in a new tab.',
    );
  });

  it('names a button by its kind, and by where it goes when it leaves the app', () => {
    expect(playAlongLabel({ kind: 'original', provider: 'youtube', hostLabel: 'YouTube' })).toBe(
      'Original',
    );
    expect(playAlongLabel({ kind: 'drumless', provider: 'spotify', hostLabel: 'Spotify' })).toBe(
      'Drumless on Spotify',
    );
    expect(playAlongLabel({ kind: 'original', provider: 'web', hostLabel: 'example.com' })).toBe(
      'Original on example.com',
    );
  });
});

const row = (
  id: string,
  kind: SongLink['kind'],
  url: string,
  created_at = '2026-11-20T10:00:00Z',
) => ({
  id,
  kind,
  url,
  created_at,
});

describe('usableLinks', () => {
  it('orders Original, Drumless, then the others oldest first', () => {
    const links = usableLinks([
      row('c', 'other', 'https://example.com/b', '2026-11-22T10:00:00Z'),
      row('d', 'drumless', SPOTIFY),
      row('b', 'other', 'https://example.com/a', '2026-11-21T10:00:00Z'),
      row('a', 'original', WATCH),
    ]);
    expect(links.map((link) => link.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(links[0]).toMatchObject({ kind: 'original', provider: 'youtube', mediaId: VIDEO });
  });

  it('reads the URL again, whatever a row says it is, and leaves out one it refuses', () => {
    const links = usableLinks([
      row('a', 'original', 'javascript:alert(1)'),
      row('b', 'drumless', `https://youtube.com.evil.test/watch?v=${VIDEO}`),
      row('c', 'other', 'http://example.com/'),
      row('d', 'other', 'https://example.com/ok'),
    ]);
    expect(links.map((link) => link.id)).toEqual(['d']);
  });
});

describe('videoSources', () => {
  it('gives the YouTube links saved as Original and Drumless, in that order', () => {
    const sources = videoSources(
      usableLinks([
        row('a', 'drumless', `${WATCH}&t=30s`),
        row('b', 'original', `https://youtu.be/${VIDEO}`),
        row('c', 'other', WATCH),
      ]),
    );
    expect(sources.map((video) => video.source)).toEqual(['original', 'drumless']);
    expect(sources[1]?.embedUrl).toContain('&start=30');
  });

  it('never gives a Spotify or other link, which can’t play in the app', () => {
    expect(
      videoSources(
        usableLinks([
          row('a', 'original', SPOTIFY),
          row('b', 'drumless', 'https://example.com/drumless'),
        ]),
      ),
    ).toEqual([]);
  });
});

describe('chooseSource', () => {
  const links = usableLinks([row('a', 'original', WATCH), row('b', 'drumless', SPOTIFY)]);
  const settled = { data: links, fetching: false, fetchedAfterMount: true };

  it.each([null, '', 'tab', 'other', 'ORIGINAL', 'javascript:alert(1)'])(
    'is the tab for ?source=%j, with nothing to tidy',
    (requested) => {
      expect(chooseSource(requested, settled)).toEqual({ state: 'tab', dropRequest: false });
    },
  );

  it('shows a recording the song has a video for', () => {
    expect(chooseSource('original', settled)).toMatchObject({
      state: 'recording',
      video: { source: 'original' },
    });
  });

  it('shows it at once from cached links, before any read', () => {
    expect(
      chooseSource('original', { data: links, fetching: true, fetchedAfterMount: false }),
    ).toMatchObject({ state: 'recording' });
  });

  it('falls back to the tab for a kind the song has no video for, and drops the request', () => {
    expect(chooseSource('drumless', settled)).toEqual({ state: 'tab', dropRequest: true });
  });

  it('waits for the first read since the page opened before it gives up on a recording', () => {
    const lacking = { data: [] as SongLink[], fetchedAfterMount: false };
    expect(chooseSource('original', { ...lacking, fetching: true })).toEqual({
      state: 'waiting',
      source: 'original',
    });
    expect(
      chooseSource('original', { data: undefined, fetching: true, fetchedAfterMount: false }),
    ).toEqual({ state: 'waiting', source: 'original' });
    // The read failed, or can't run offline: nothing more is coming.
    expect(chooseSource('original', { ...lacking, fetching: false })).toEqual({
      state: 'tab',
      dropRequest: true,
    });
  });

  it('gives up once that read is in, even while a later one runs', () => {
    expect(chooseSource('original', { data: [], fetching: true, fetchedAfterMount: true })).toEqual(
      { state: 'tab', dropRequest: true },
    );
  });
});
