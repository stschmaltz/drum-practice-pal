import { SONG_LINK_URL_MAX_LENGTH } from '@/lib/schema';
import {
  chooseSource,
  keptLinkText,
  LINK_REFUSAL_COPY,
  otherLinkLabel,
  otherLinkNames,
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
    ['words with another site’s address and no scheme', 'the song example.com/lesson', 'notALink'],
    ['brackets round nothing', '()', 'notALink'],
    ['words round an http: link', `the song http://youtu.be/${VIDEO}`, 'notHttps'],
    [
      'words round a look-alike',
      `watch https://youtube.com.evil.test/watch?v=${VIDEO}`,
      'lookAlike',
    ],
    ['a javascript: address and a word', 'javascript:alert(1) x', 'notALink'],
    ['a scheme and nothing else', 'https://', 'notALink'],
    ['a host with no dot', 'https://localhost/x', 'notALink'],
    ['a look-alike host', `https://youtube.com.evil.test/watch?v=${VIDEO}`, 'lookAlike'],
    ['a look-alike with www', `https://www.youtube.com.evil.test/watch?v=${VIDEO}`, 'lookAlike'],
    ['a look-alike short host', `https://youtu.be.evil.test/${VIDEO}`, 'lookAlike'],
    ['a look-alike Spotify host', `https://open.spotify.com.evil.test/track/${TRACK}`, 'lookAlike'],
    ['a host that only contains the name', 'https://youtube-login.test/watch', 'lookAlike'],
    ['a host that ends in the name', `https://notyoutube.com/watch?v=${VIDEO}`, 'lookAlike'],
    // Refused for carrying sign-in details, whatever the host: "youtube.com@evil.test" opens evil.test.
    ['a sign-in part before the host', `https://youtube.com@evil.test/watch?v=${VIDEO}`, 'signIn'],
    ['a sign-in part with a password', 'https://user:pass@example.com/', 'signIn'],
    [
      'a sign-in part on YouTube itself',
      `https://user:pw@www.youtube.com/watch?v=${VIDEO}`,
      'signIn',
    ],
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

  // 14 Review: the address is safe by what it is built from, not by who calls it. A start
  // that isn't whole seconds (nothing the parser gives; a value from anywhere else) is left out.
  it.each([
    ['text carrying a parameter', '90&autoplay=1'],
    ['text carrying a fragment', '90#x'],
    ['a fraction', 1.5],
    ['a negative number', -5],
    ['not a number', Number.NaN],
    ['zero', 0],
  ])('leaves out a start that is %s', (_name, startSeconds) => {
    expect(youTubeEmbedUrl({ mediaId: VIDEO, startSeconds: startSeconds as number })).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO}?playsinline=1&rel=0`,
    );
  });
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
    expect(recognisedAs(accepted(WATCH), 'drumless')).toBe(
      'YouTube video. Plays here, with the tab under it.',
    );
    expect(recognisedAs(accepted(SPOTIFY))).toContain("can't slow a song down");
    expect(recognisedAs(accepted('https://example.com/x'))).toBe(
      'Link to example.com. Opens in a new tab.',
    );
  });

  // 14 QA issue 4: only an Original or Drumless video plays in the app.
  it('says a YouTube video in an Other field opens in YouTube, not that it plays here', () => {
    expect(recognisedAs(accepted(WATCH), 'other')).toBe('YouTube video. Opens in YouTube.');
    expect(recognisedAs(accepted(`${WATCH}&t=90`), 'other')).toBe(
      'YouTube video, starting at 1:30. Opens in YouTube.',
    );
    expect(recognisedAs(accepted(SPOTIFY), 'other')).toBe(recognisedAs(accepted(SPOTIFY)));
  });

  // 14 QA issue 8: an Other link reads as a link, not as a raw address.
  it.each([
    ['https://www.drumeo.com/beat', 'drumeo.com/beat'],
    ['https://example.com/', 'example.com'],
    ['https://example.com', 'example.com'],
    [SPOTIFY.replace('/track/', '/album/'), 'open.spotify.com/album/4uLU6hMCjMI75M1A…'],
    [`${WATCH}x`, 'youtube.com/watch?v=dQw4w9WgXcQx'],
    ['https://example.com/a?b=1#part', 'example.com/a?b=1#part'],
    [`https://example.com/${'a'.repeat(300)}`, `example.com/${'a'.repeat(27)}…`],
    [`https://${'a'.repeat(50)}.example.com/lesson/one`, `${'a'.repeat(50)}.example.com/…`],
  ])('shows the other link %s as %s', (url, label) => {
    expect(otherLinkLabel(accepted(url))).toBe(label);
  });

  // 14 Review, from QA (after fix round 1) issue 7: an other link is named for what it is.
  it('names other links for what was recognised, and numbers the ones that share a name', () => {
    const links = [
      accepted(WATCH),
      accepted('https://www.drumeo.com/beat'),
      accepted(SPOTIFY),
      accepted('https://youtu.be/aaaaaaaaaaa?t=90'),
      accepted('https://www.drumeo.com/beat'),
      accepted(`${WATCH}&t=5`),
      // No video and no track: named by its address, like any other site.
      accepted('https://www.youtube.com/@somedrummer'),
    ];
    expect(otherLinkNames(links)).toEqual([
      'YouTube video',
      'drumeo.com/beat',
      'Spotify track',
      'YouTube video 2',
      'drumeo.com/beat 2',
      'YouTube video 3',
      'youtube.com/@somedrummer',
    ]);
    expect(otherLinkNames([])).toEqual([]);
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

// Unit 14 Test: the shapes a paste really has (a link lifted out of a sentence, a host in
// another script, an address typed by hand), and what each one may become.
describe('parseSongLink: more YouTube shapes', () => {
  it.each([
    ['its port', `https://www.youtube.com:443/watch?v=${VIDEO}`],
    ['another port, which the saved form drops', `https://www.youtube.com:8443/watch?v=${VIDEO}`],
    ['a scheme and host in capitals', `HTTPS://YOUTU.BE/${VIDEO}`],
    ['a slash after watch', `https://www.youtube.com/watch/?v=${VIDEO}`],
    ['a doubled slash', `https://www.youtube.com//watch?v=${VIDEO}`],
    ['a slash after a short link', `https://youtu.be/${VIDEO}/`],
    ['more path after a short link', `https://youtu.be/${VIDEO}/extra`],
    ['another subdomain of YouTube', `https://gaming.youtube.com/watch?v=${VIDEO}`],
    ['two v parameters, the first', `https://www.youtube.com/watch?v=${VIDEO}&v=AAAAAAAAAAA`],
    ['a host typed in full-width letters', `https://ｙｏｕｔｕｂｅ.com/watch?v=${VIDEO}`],
    ['a start time in the fragment, which is dropped', `${WATCH}#t=90`],
    ['a backslash for a slash', `https:\\\\www.youtube.com\\watch?v=${VIDEO}`],
  ])('takes a watch address with %s', (_name, text) => {
    expect(accepted(text).url).toBe(WATCH);
  });

  it.each([
    ['t=1h', 3600],
    ['t=01m05s', 65],
    ['t=1h30m', 5400],
    ['t=90&start=45', 90],
    ['start=45&t=90', 90],
    // A whole day is the most a start time may be.
    ['t=86400', 86400],
  ])('reads %s as a start time', (param, seconds) => {
    expect(accepted(`${WATCH}&${param}`)).toMatchObject({
      startSeconds: seconds,
      url: `${WATCH}&t=${seconds}s`,
    });
  });

  it.each(['t=86401', 't=90S', 't=30s1m', 't=1h2', 't=%20', 'start=1m30s&t='])(
    'drops %s and keeps the video, from its beginning',
    (param) => {
      expect(accepted(`${WATCH}&${param}`)).toMatchObject({ url: WATCH, mediaId: VIDEO });
    },
  );

  it('a start time survives the round trip into the frame’s address and the way out', () => {
    for (const param of ['t=1m30s', 't=90', 'start=90', 't=90s']) {
      const link = accepted(`https://youtu.be/${VIDEO}?si=abc&${param}`);
      expect(link.url).toBe(`${WATCH}&t=90s`);
      expect(youTubeEmbedUrl(link)).toBe(
        `https://www.youtube-nocookie.com/embed/${VIDEO}?playsinline=1&rel=0&start=90`,
      );
      expect(youTubeEmbedUrl(accepted(link.url))).toBe(youTubeEmbedUrl(link));
    }
  });

  // What follows the id and isn't a sentence's punctuation isn't part of an id either, so it
  // is never played as some other video: it is a plain link, and says so.
  it.each([
    ['a twelfth character', `${WATCH}x`],
    ['an encoded NUL', `${WATCH}%00`],
    ['v in capitals', `https://www.youtube.com/watch?V=${VIDEO}`],
    [
      'a redirect that carries the video',
      `https://www.youtube.com/attribution_link?u=/watch?v=${VIDEO}`,
    ],
  ])('with %s after it, is a plain link to YouTube that never plays here', (_name, text) => {
    const link = accepted(text);
    expect(link).toMatchObject({ provider: 'web', mediaId: null, hostLabel: 'YouTube' });
    expect(new URL(link.url).hostname).toMatch(/(^|\.)(youtube\.com|youtu\.be)$/);
    expect(youTubeEmbedUrl(link)).toBeNull();
    expect(recognisedAs(link)).toBe('Link to YouTube. Opens in a new tab.');
  });
});

// 14 Review, from QA (after fix round 1) issue 5: a link pasted alone still brings what was
// round it, or after it, where it was copied from.
describe('parseSongLink: a link alone, as it is copied out of a message', () => {
  it.each([
    ['round brackets', `(https://youtu.be/${VIDEO})`, WATCH],
    ['angle brackets', `<https://youtu.be/${VIDEO}>`, WATCH],
    ['square brackets', `[${WATCH}]`, WATCH],
    ['double quotes', `"https://youtu.be/${VIDEO}"`, WATCH],
    ['single quotes', `'${SPOTIFY}'`, SPOTIFY],
    ['curly quotes', `“${SPOTIFY}”`, SPOTIFY],
    ['brackets and a full stop', `(${WATCH}).`, WATCH],
    ['angle brackets with no scheme', `<youtu.be/${VIDEO}>`, WATCH],
    ['brackets round another site', '(https://example.com/lesson)', 'https://example.com/lesson'],
    ['quotes round a Spotify URI', `"spotify:track:${TRACK}"`, SPOTIFY],
  ])('takes a link alone inside %s', (_name, text, url) => {
    expect(accepted(text).url).toBe(url);
  });

  it.each([
    ['a full stop after a short link', `https://youtu.be/${VIDEO}.`, WATCH],
    ['a comma after a watch address', `${WATCH},`, WATCH],
    ['a bracket after a short link', `https://youtu.be/${VIDEO})`, WATCH],
    ['a full stop after a start time', `${WATCH}&t=90.`, `${WATCH}&t=90s`],
    ['a full stop after a Spotify track', `${SPOTIFY}.`, SPOTIFY],
    ['a full stop after another site', 'https://example.com/lesson.', 'https://example.com/lesson'],
    ['a comma after another site', 'https://example.com/lesson,', 'https://example.com/lesson'],
    ['a full stop after a bare host', 'example.com.', 'https://example.com/'],
    ['several marks', 'https://example.com/lesson!.,', 'https://example.com/lesson'],
  ])('never takes %s as part of the link', (_name, text, url) => {
    const link = accepted(text);
    expect(link.url).toBe(url);
    // And so a video is the video, not a link out to an address YouTube doesn't have.
    if (url.startsWith(WATCH)) expect(link).toMatchObject({ provider: 'youtube', mediaId: VIDEO });
  });

  it.each([
    ['alone', 'https://en.wikipedia.org/wiki/Rush_(band)'],
    ['in brackets of its own', '(https://en.wikipedia.org/wiki/Rush_(band))'],
    ['in a sentence', 'see https://en.wikipedia.org/wiki/Rush_(band) now'],
    ['at a sentence’s end', 'It is at https://en.wikipedia.org/wiki/Rush_(band).'],
    ['in brackets in a sentence', 'the band (https://en.wikipedia.org/wiki/Rush_(band)) rocks'],
  ])('keeps a closing bracket whose opening one is in the address: %s', (_name, text) => {
    expect(accepted(text).url).toBe('https://en.wikipedia.org/wiki/Rush_(band)');
  });

  it('keeps any kind of bracket that opens inside the address, and drops one that doesn’t', () => {
    expect(accepted('https://example.com/a[1]]').url).toBe(
      accepted('https://example.com/a[1]').url,
    );
    expect(accepted('{https://example.com/a?x={y}}').url).toBe(
      accepted('https://example.com/a?x={y}').url,
    );
    expect(accepted('https://example.com/a(b)c)').url).toBe('https://example.com/a(b)c');
  });

  it.each([
    ['YouTube’s short host', `youtu.be/${VIDEO}`, WATCH],
    ['youtube.com', `youtube.com/watch?v=${VIDEO}`, WATCH],
    ['www.youtube.com', `www.youtube.com/watch?v=${VIDEO}&t=90`, `${WATCH}&t=90s`],
    ['m.youtube.com', `m.youtube.com/watch?v=${VIDEO}`, WATCH],
    ['music.youtube.com', `music.youtube.com/watch?v=${VIDEO}`, WATCH],
    ['Spotify', `open.spotify.com/track/${TRACK}`, SPOTIFY],
    ['Spotify with its share parameter', `open.spotify.com/track/${TRACK}?si=abc`, SPOTIFY],
  ])('gives %s typed without a scheme https://, alone and after a title', (_name, text, url) => {
    expect(accepted(text).url).toBe(url);
    expect(accepted(`Song title ${text}`).url).toBe(url);
    expect(accepted(`Song title (${text}).`).url).toBe(url);
    // The field then shows the address, and reads it as the same link.
    expect(keptLinkText(`Song title ${text}`)).toBe(text);
  });

  it('takes whichever address comes first in the words, with a scheme or without', () => {
    expect(accepted(`youtu.be/${VIDEO} or ${SPOTIFY}`).url).toBe(WATCH);
    expect(accepted(`${SPOTIFY} or youtu.be/${VIDEO}`).url).toBe(SPOTIFY);
  });

  it.each([
    ['inside another host’s path', `see evil.test/youtu.be/${VIDEO}`],
    ['after a hyphen', `see evil-youtube.com/watch?v=${VIDEO}`],
    ['at the end of a longer name', `see notyoutube.com/watch?v=${VIDEO}`],
    ['after a sign-in part', `see user@youtu.be/${VIDEO}`],
    ['as a subdomain of something else', `see youtu.be.evil.test/${VIDEO}`],
  ])('finds no YouTube address %s', (_name, text) => {
    expect(refusal(text)).toBe('notALink');
  });
});

describe('parseSongLink: hosts in other scripts', () => {
  it.each([
    ['https://münchen.example/lesson', 'https://xn--mnchen-3ya.example/lesson'],
    ['https://xn--mnchen-3ya.example/lesson', 'https://xn--mnchen-3ya.example/lesson'],
    ['https://例え.テスト/drums', 'https://xn--r8jz45g.xn--zckzah/drums'],
    ['https://MÜNCHEN.example/Lesson', 'https://xn--mnchen-3ya.example/Lesson'],
  ])('saves %s under its punycode host, and names it by that', (text, url) => {
    const link = accepted(text);
    expect(link).toMatchObject({ provider: 'web', url, hostLabel: new URL(url).hostname });
    expect(accepted(link.url)).toEqual(link);
  });

  it('keeps a path and query in another script, encoded, and reads it back the same', () => {
    const link = accepted('https://example.com/путь?q=ударные#часть');
    expect(link.url).toBe(
      'https://example.com/%D0%BF%D1%83%D1%82%D1%8C?q=%D1%83%D0%B4%D0%B0%D1%80%D0%BD%D1%8B%D0%B5#%D1%87%D0%B0%D1%81%D1%82%D1%8C',
    );
    expect(accepted(link.url)).toEqual(link);
  });

  it('counts the length of what is saved: a short address that encodes long is refused', () => {
    const text = `https://example.com/${'é'.repeat(400)}`;
    expect(text.length).toBeLessThan(SONG_LINK_URL_MAX_LENGTH);
    expect(refusal(text)).toBe('tooLong');
  });

  // youtube.com with a Cyrillic letter for its last "e", and the same host already in punycode. The parser
  // doesn't refuse them (14 Test, bug 1); what is pinned here is that neither is ever taken
  // for YouTube: not played, not named "YouTube", and shown by the host it really opens.
  it.each([
    `https://youtub\u0435.com/watch?v=${VIDEO}`,
    `https://xn--youtub-8of.com/watch?v=${VIDEO}`,
  ])('a look-alike in another script, %s, is never YouTube', (text) => {
    const link = accepted(text);
    expect(link).toMatchObject({ provider: 'web', mediaId: null, hostLabel: 'xn--youtub-8of.com' });
    expect(link.url).toBe(`https://xn--youtub-8of.com/watch?v=${VIDEO}`);
    expect(youTubeEmbedUrl(link)).toBeNull();
    expect(videoSources([{ ...link, id: 'a', kind: 'original', barOneSeconds: null }])).toEqual([]);
    expect(recognisedAs(link)).toBe('Link to xn--youtub-8of.com. Opens in a new tab.');
  });

  it('takes out characters that don’t show, so the host saved is the host opened', () => {
    expect(accepted('https://exa\u200bmple.com/x').url).toBe('https://example.com/x');
    expect(accepted('https://example.com/\u202egpj.exe').url).toBe(
      'https://example.com/%E2%80%AEgpj.exe',
    );
  });
});

describe('parseSongLink: an address that says one host and opens another', () => {
  // Where the browser would go is the only host that counts: each is parsed as the browser does.
  it.each([
    // A backslash is a slash to a browser: this is youtube.com, at the path /@evil.test/…
    [`https://www.youtube.com\\@evil.test/watch?v=${VIDEO}`, 'www.youtube.com', 'YouTube'],
    [`https://evil.test\\.youtube.com/watch?v=${VIDEO}`, 'evil.test', 'evil.test'],
    [`https://evil.test/watch?v=${VIDEO}#@youtube.com`, 'evil.test', 'evil.test'],
    [`https://evil.test/youtube.com/watch?v=${VIDEO}`, 'evil.test', 'evil.test'],
    [`https://evil.test/?next=https://youtu.be/${VIDEO}`, 'evil.test', 'evil.test'],
    [`https://evil.test/open.spotify.com/track/${TRACK}`, 'evil.test', 'evil.test'],
  ])('%s is a plain link named for where it opens', (text, host, label) => {
    const link = accepted(text);
    expect(new URL(link.url).hostname).toBe(host);
    expect(link).toMatchObject({ provider: 'web', mediaId: null, hostLabel: label });
    expect(youTubeEmbedUrl(link)).toBeNull();
  });

  it.each<[string, LinkRefusal]>([
    [`https://www.youtube.com%2eevil.test/watch?v=${VIDEO}`, 'lookAlike'],
    [`https://youtube.com.au/watch?v=${VIDEO}`, 'lookAlike'],
    [`https://www.youtube.com.:pw@evil.test/`, 'signIn'],
    [`https://open.spotify.com:x@evil.test/track/${TRACK}`, 'signIn'],
    [`https://my-spotify-playlists.test/track/${TRACK}`, 'lookAlike'],
  ])('refuses %s', (text, reason) => {
    expect(refusal(text)).toBe(reason);
  });
});

describe('parseSongLink: more refusals', () => {
  it.each<[string, string, LinkRefusal]>([
    ['an email address', 'mailto:a@example.com', 'notHttps'],
    ['a phone number', 'tel:123', 'notHttps'],
    [
      'an Android intent',
      `intent://youtube.com/watch?v=${VIDEO}#Intent;scheme=https;end`,
      'notHttps',
    ],
    ['the YouTube app’s own scheme', `vnd.youtube:${VIDEO}`, 'notHttps'],
    ['youtube://', `youtube://watch?v=${VIDEO}`, 'notHttps'],
    ['spotify://', `spotify://track/${TRACK}`, 'notHttps'],
    ['a Spotify URI with more after it', `spotify:track:${TRACK}?si=abc`, 'notHttps'],
    ['a Spotify URI for a short id', 'spotify:track:abc', 'notHttps'],
    ['javascript: with a host', 'javascript://youtube.com/%0aalert(1)', 'notHttps'],
    ['javascript: after a space', ' javascript:alert(1)', 'notHttps'],
    ['javascript: with a tab inside', 'java\tscript:alert(1)', 'notALink'],
    ['javascript: after a control character', '\u0001javascript:alert(1)', 'notALink'],
    ['an IPv6 address', 'https://[::1]/x', 'notALink'],
    // Read as the scheme "example.com:", which an address bar wouldn't; refused either way.
    ['a host and port with no scheme', 'example.com:8080/x', 'notHttps'],
  ])('refuses %s', (_name, text, reason) => {
    expect(refusal(text)).toBe(reason);
  });
});

describe('parseSongLink: more Spotify and tracking', () => {
  it('takes a track address with a slash after it', () => {
    expect(accepted(`${SPOTIFY}/`).url).toBe(SPOTIFY);
  });

  it.each([
    ['a twenty-third character', `${SPOTIFY}x`],
    ['the embed player’s address', `https://open.spotify.com/embed/track/${TRACK}`],
    ['another Spotify host', `https://play.spotify.com/track/${TRACK}`],
    ['two language segments', `https://open.spotify.com/intl-de/intl-fr/track/${TRACK}`],
  ])('keeps %s as a plain link to Spotify, not a track', (_name, text) => {
    expect(accepted(text)).toMatchObject({ provider: 'web', mediaId: null, hostLabel: 'Spotify' });
  });

  it('drops only the tracking parameters it knows, and leaves every other one as it was', () => {
    expect(accepted('https://example.com/?a=1&a=2&b=%26&q=a+b&si=x&utm_campaign=y').url).toBe(
      'https://example.com/?a=1&a=2&b=%26&q=a+b',
    );
    // Names are matched as written: a site's own SI or UTM_SOURCE isn't the share sheet's.
    expect(accepted('https://example.com/?SI=b&UTM_SOURCE=c').url).toBe(
      'https://example.com/?SI=b&UTM_SOURCE=c',
    );
  });
});

describe('parseSongLink: what every saved link is', () => {
  const pasted = [
    `https://youtu.be/${VIDEO}?si=abc&t=1m30s`,
    `youtu.be/${VIDEO}`,
    `https://www.youtube.com:8443/watch?v=${VIDEO}`,
    `https://www.youtube.com\\@evil.test/watch?v=${VIDEO}`,
    `https://youtu.be/${VIDEO}).`,
    `(https://youtu.be/${VIDEO})`,
    'https://example.com/lesson.',
    '(https://en.wikipedia.org/wiki/Rush_(band))',
    `Song title open.spotify.com/track/${TRACK}.`,
    'https://www.youtube.com/@somedrummer',
    `spotify:track:${TRACK}`,
    `https://open.spotify.com/intl-de/track/${TRACK}?si=abc`,
    'https://spotify.link/AbCdEf',
    'https://münchen.example/lesson?utm_source=x',
    `https://youtub\u0435.com/watch?v=${VIDEO}`,
    'https://example.com/путь?q=ударные',
    'example.com/cover',
    'https:/example.com/x',
    '//example.com/x',
    'https://127.0.0.1/x',
    'https://example.com./x',
    'https://example.com/x\u0000y',
  ];

  it.each(pasted)(
    '%s: https, no sign-in part, within the limit, and read back unchanged',
    (text) => {
      const link = accepted(text);
      const url = new URL(link.url);
      expect(url.protocol).toBe('https:');
      expect(url.username + url.password).toBe('');
      expect(url.href).toBe(link.url);
      expect(link.url.length).toBeLessThanOrEqual(SONG_LINK_URL_MAX_LENGTH);
      expect(link.url).not.toMatch(/\s/);
      // Saved, read from the row and parsed again (as `usableLinks` does), it is the same link.
      expect(accepted(link.url)).toEqual(link);
      if (link.provider === 'youtube') {
        expect(url.origin + url.pathname).toBe('https://www.youtube.com/watch');
        expect(youTubeEmbedUrl(link)).toMatch(
          /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?playsinline=1&rel=0(&start=\d+)?$/,
        );
      } else {
        expect(youTubeEmbedUrl(link)).toBeNull();
      }
      if (link.provider === 'spotify') expect(link.url).toBe(SPOTIFY);
    },
  );
});

// 14 QA issue 6: a share sheet's text, or a title typed before the link. The first http(s)
// address in the paste is the link; the words round it are dropped.
describe('parseSongLink: a link with words round it', () => {
  it.each([
    ['a title before it', `Never Gonna Give You Up https://youtu.be/${VIDEO}`, WATCH],
    ['a share sheet’s sentence', `Check out this song on Spotify: ${SPOTIFY}?si=abc`, SPOTIFY],
    ['words after it', `https://youtu.be/${VIDEO}?t=90 from the solo`, `${WATCH}&t=90s`],
    ['words on both sides, over lines', `Listen:\n${SPOTIFY}\nsent from my phone`, SPOTIFY],
    ['two links, the first', `https://youtu.be/${VIDEO} ${SPOTIFY}`, WATCH],
    ['two links with words between', `${SPOTIFY} or https://youtu.be/${VIDEO}`, SPOTIFY],
    ['a full stop that ends the sentence', `It is https://youtu.be/${VIDEO}. Enjoy`, WATCH],
    ['brackets round it in a sentence', `the video (https://youtu.be/${VIDEO}) is good`, WATCH],
    ['quotes and a comma', `see "https://youtu.be/${VIDEO}", then play`, WATCH],
    ['the scheme in capitals', `song HTTPS://youtu.be/${VIDEO}`, WATCH],
    [
      'another site',
      'my lesson https://example.com/lesson?id=7 (week 2)',
      'https://example.com/lesson?id=7',
    ],
    ['a no-break space before it', `Song\u00a0https://youtu.be/${VIDEO}`, WATCH],
  ])('takes the link from %s', (_name, text, url) => {
    expect(accepted(text).url).toBe(url);
  });

  // What was kept is what the field then shows, so the user sees what will be saved.
  it.each([
    [`Never Gonna Give You Up https://youtu.be/${VIDEO}`, `https://youtu.be/${VIDEO}`],
    [`It is https://youtu.be/${VIDEO}. Enjoy`, `https://youtu.be/${VIDEO}`],
    [`https://youtu.be/${VIDEO} ${SPOTIFY}`, `https://youtu.be/${VIDEO}`],
    ['https://example.com/a b', 'https://example.com/a'],
    // An address broken by a line break keeps its first part, on show, never a guess at the rest.
    [`https://youtu.be/\n${VIDEO}`, 'https://youtu.be/'],
  ])('keeps %j as %s', (text, kept) => {
    expect(keptLinkText(text)).toBe(kept);
    expect(parseSongLink(text)).toEqual(parseSongLink(kept));
  });

  it.each([
    `https://youtu.be/${VIDEO}`,
    ` https://youtu.be/${VIDEO}\n`,
    `youtu.be/${VIDEO}`,
    'the one from the lesson',
    'the song example.com/lesson',
    '',
    `(https://youtu.be/${VIDEO})`,
    `https://youtu.be/${VIDEO}.`,
  ])('leaves %j as it was typed', (text) => {
    expect(keptLinkText(text)).toBe(text);
  });

  it('counts the length of the link, not of the words round it', () => {
    const words = 'la '.repeat(1000);
    expect(accepted(`${words}https://youtu.be/${VIDEO}`).url).toBe(WATCH);
    expect(refusal(`song https://example.com/${'a'.repeat(3000)}`)).toBe('tooLong');
  });
});
