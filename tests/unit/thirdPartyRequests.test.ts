// @vitest-environment node
/**
 * Unit 14: nothing of YouTube's or Spotify's is asked for until a recording
 * is opened. The component and e2e tests watch the pages; this reads the
 * places a request could be made from without any page drawing it: the
 * document every screen loads, the service worker's configuration, and the
 * source itself (one frame, in one component, and no script, fetch or
 * preconnect to either service anywhere).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css|html)$/.test(entry.name) ? [path] : [];
  });
}

/** App code: what ships. Tests and test helpers name the services freely. */
const appFiles = sourceFiles('src').filter(
  (path) => !/\.test\.tsx?$/.test(path) && !path.startsWith('src/test/'),
);
/** Comments say "YouTube" a lot; only code can make a request. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const code = (path: string) => withoutComments(read(path));
const filesWith = (pattern: RegExp) =>
  appFiles.filter((path) => pattern.test(code(path))).map((path) => relative('src', path));

const SERVICE_HOST =
  /youtube|youtu\.be|ytimg|googlevideo|ggpht|google\.com|gstatic|doubleclick|spotify|scdn\.co/i;

describe('the document every screen loads', () => {
  const html = read('index.html');
  const tags = [...html.matchAll(/<(link|script|img|iframe|meta)\b[^>]*>/g)].map(([tag]) => tag);

  it('has tags to check', () => {
    expect(tags.length).toBeGreaterThan(5);
    expect(tags.some((tag) => tag.startsWith('<script'))).toBe(true);
  });

  it('loads nothing from another origin: every address in it is this site’s own', () => {
    const addresses = tags.flatMap((tag) =>
      [...tag.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(([, address]) => address ?? ''),
    );
    expect(addresses.length).toBeGreaterThan(2);
    for (const address of addresses) expect(address).toMatch(/^\/(?!\/)/);
    expect(html).not.toMatch(SERVICE_HOST);
  });

  it('warms up no connection and fetches nothing ahead: no preconnect, dns-prefetch, preload or prefetch', () => {
    expect(html).not.toMatch(/rel="[^"]*(preconnect|dns-prefetch|preload|prefetch|prerender)/i);
    expect(html).not.toMatch(/http-equiv/i);
    expect(html).not.toMatch(/<iframe/i);
  });
});

describe('the service worker', () => {
  const config = withoutComments(read('vite.config.ts'));

  it('precaches this site’s own files only, and caches nothing as it is fetched', () => {
    // The precache is a list of globs over the build's own folder; a runtime route is the
    // only way the worker could ask another origin for anything.
    expect(config).toMatch(/globPatterns:/);
    expect(config).not.toMatch(/runtimeCaching|additionalManifestEntries|importScripts/);
    expect(config).not.toMatch(SERVICE_HOST);
    expect(config).not.toMatch(/https?:\/\//);
  });
});

describe('the app’s code', () => {
  it('found the code to read, the recordings feature included', () => {
    expect(appFiles.length).toBeGreaterThan(100);
    expect(appFiles).toContain('src/features/recordings/RecordingBox.tsx');
    // The comment stripper leaves the addresses in strings alone.
    expect(code('src/features/recordings/songLinks.ts')).toContain(
      'https://www.youtube-nocookie.com/embed/',
    );
  });

  it('makes a frame in one place only, the play screen’s video box', () => {
    expect(filesWith(/<iframe\b|createElement\(\s*['"`]iframe/i)).toEqual([
      join('features', 'recordings', 'RecordingBox.tsx'),
    ]);
  });

  it('builds the player’s address in one place only, from a parsed video id', () => {
    expect(filesWith(/youtube-nocookie\.com\/embed/)).toEqual([
      join('features', 'recordings', 'songLinks.ts'),
    ]);
    // And never the cookie-setting player.
    expect(filesWith(/youtube\.com\/embed/)).toEqual([]);
  });

  it('loads no script of YouTube’s or Spotify’s, and asks neither for a title, a thumbnail or a preview', () => {
    expect(
      filesWith(
        /iframe_api|player_api|www-widgetapi|oembed|ytimg|googlevideo|embed\.spotify|open\.spotify\.com\/embed|api\.spotify|scdn\.co/i,
      ),
    ).toEqual([]);
    expect(filesWith(/createElement\(\s*['"`](script|link)['"`]/)).toEqual([]);
  });

  it('lets the frame do no more than play: no autoplay, no camera, microphone, clipboard or location', () => {
    const box = code('src/features/recordings/RecordingBox.tsx');
    const allow = /FRAME_ALLOW\s*=\s*'([^']*)'/.exec(box)?.[1];
    expect(
      allow
        ?.split(';')
        .map((part) => part.trim())
        .sort(),
    ).toEqual(['accelerometer', 'encrypted-media', 'fullscreen', 'picture-in-picture']);
    expect(box).not.toMatch(/autoplay=1|enablejsapi/);
    expect(code('src/features/recordings/songLinks.ts')).not.toMatch(/autoplay|enablejsapi/);
  });
});
