/**
 * Unit 13: no screen shows an error's own message (a browser's "Failed to
 * fetch", a Postgres constraint, Auth's text). Failures reach the user only
 * through `failureCopy` / `signInFailureCopy` (src/lib/errorCopy.ts); the one
 * message a component may show as is belongs to an error the app wrote itself
 * (`SongFileError`, a `UserFacingError`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function componentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : componentFiles(path);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
  });
}

/**
 * An error's message read where neither its line nor the one before says it is
 * one the app wrote (a ternary's test often sits on the line above).
 */
function rawMessages(source: string): string[] {
  const lines = source.split('\n').map((line) => line.trim());
  const appWritten = /SongFileError|UserFacingError/;
  return lines
    .map((line, index) => ({ line, number: index + 1, above: lines[index - 1] ?? '' }))
    .filter(
      ({ line, above }) =>
        /\.message\b/.test(line) && !appWritten.test(line) && !appWritten.test(above),
    )
    .map(({ line, number }) => `${number}: ${line}`);
}

describe('error copy in components', () => {
  const files = componentFiles(join(root, 'src'));

  it('finds the components it checks', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("renders no error's own message", () => {
    const found = files.flatMap((file) =>
      rawMessages(readFileSync(file, 'utf8')).map((hit) => `${relative(root, file)}:${hit}`),
    );
    expect(found).toEqual([]);
  });

  it('the rule bites on the pattern every screen used before Unit 13', () => {
    expect(
      rawMessages("<ErrorAlert>Couldn't save the loop: {mutation.error.message}</ErrorAlert>"),
    ).toHaveLength(1);
    expect(rawMessages("error instanceof SongFileError ? `${error.message}` : ''")).toEqual([]);
  });
});
