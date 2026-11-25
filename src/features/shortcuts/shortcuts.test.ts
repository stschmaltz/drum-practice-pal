import { COUNT_IN_BAR_OPTIONS, type CountInBars } from '@/lib/schema';
import {
  CHARACTER_KEYS,
  characterKeysLabel,
  focusKindOf,
  isCharacterKey,
  HELP_ROW_ACTIONS,
  KEY_BINDINGS,
  neighbourLoop,
  nextCountInBars,
  resolveShortcut,
  SHORTCUT_ACTIONS,
  shortcutAnnouncement,
  shortcutHelp,
  steppedBar,
  type AnnouncedOptions,
  type KeyPress,
  type ShortcutContext,
} from './shortcuts';

const press = (key: string, overrides: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  ...overrides,
});

const onPage: ShortcutContext = { focus: 'other', helpOpen: false, characterKeys: true };

describe('resolveShortcut', () => {
  it.each([
    [' ', 'togglePlay'],
    ['ArrowUp', 'speedUp'],
    ['ArrowDown', 'speedDown'],
    ['ArrowLeft', 'previousLoop'],
    ['PageUp', 'previousLoop'],
    ['ArrowRight', 'nextLoop'],
    ['PageDown', 'nextLoop'],
    ['m', 'metronome'],
    ['d', 'drumsMuted'],
    ['s', 'drumsOnly'],
    ['c', 'countIn'],
  ])('%j is %s', (key, action) => {
    expect(resolveShortcut(press(key), onPage)).toEqual({ action, run: true });
  });

  it('takes letters in either case, so Caps Lock makes no difference', () => {
    expect(resolveShortcut(press('M'), onPage)?.action).toBe('metronome');
    expect(resolveShortcut(press('D'), onPage)?.action).toBe('drumsMuted');
  });

  it('takes ? with the Shift most keyboards need for it', () => {
    expect(resolveShortcut(press('?', { shiftKey: true }), onPage)).toEqual({
      action: 'help',
      run: true,
    });
  });

  it('leaves every other key alone', () => {
    for (const key of ['Enter', 'Tab', 'Escape', 'Home', 'End', 'a', '1', 'F5', 'Shift']) {
      expect(resolveShortcut(press(key), onPage)).toBeNull();
    }
  });

  it('leaves the browser and system shortcuts alone', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(resolveShortcut(press('ArrowLeft', { [modifier]: true }), onPage)).toBeNull();
      expect(resolveShortcut(press('d', { [modifier]: true }), onPage)).toBeNull();
      expect(resolveShortcut(press(' ', { [modifier]: true }), onPage)).toBeNull();
    }
  });

  it('leaves Shift with anything but ? alone (Shift+Space scrolls up)', () => {
    expect(resolveShortcut(press(' ', { shiftKey: true }), onPage)).toBeNull();
    expect(resolveShortcut(press('ArrowUp', { shiftKey: true }), onPage)).toBeNull();
    expect(resolveShortcut(press('M', { shiftKey: true }), onPage)).toBeNull();
  });

  it('does nothing for a press something else has handled, or one still composing text', () => {
    expect(resolveShortcut(press(' ', { defaultPrevented: true }), onPage)).toBeNull();
    expect(resolveShortcut(press('m', { isComposing: true }), onPage)).toBeNull();
  });

  describe('a held key', () => {
    it('goes on nudging the speed', () => {
      expect(resolveShortcut(press('ArrowUp', { repeat: true }), onPage)).toEqual({
        action: 'speedUp',
        run: true,
      });
      expect(resolveShortcut(press('ArrowDown', { repeat: true }), onPage)?.run).toBe(true);
    });

    it.each([' ', 'ArrowRight', 'PageDown', 'm', 'd', 's', 'c'])(
      '%j acts once, but stays the page’s key so it doesn’t scroll',
      (key) => {
        expect(resolveShortcut(press(key, { repeat: true }), onPage)).toEqual({
          action: KEY_BINDINGS[key],
          run: false,
        });
      },
    );
  });

  describe('the input guard', () => {
    it('gives every key to a field being typed in', () => {
      const typing: ShortcutContext = { focus: 'typing', helpOpen: false, characterKeys: true };
      for (const key of Object.keys(KEY_BINDINGS)) {
        expect(resolveShortcut(press(key), typing)).toBeNull();
      }
    });

    it('gives a slider its arrow and page keys, and keeps the rest', () => {
      const slider: ShortcutContext = { focus: 'slider', helpOpen: false, characterKeys: true };
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']) {
        expect(resolveShortcut(press(key), slider)).toBeNull();
      }
      expect(resolveShortcut(press(' '), slider)?.action).toBe('togglePlay');
      expect(resolveShortcut(press('m'), slider)?.action).toBe('metronome');
    });

    it('gives a radio or a menu item its arrows, and leaves the page keys to the pedal', () => {
      const choice: ShortcutContext = { focus: 'choice', helpOpen: false, characterKeys: true };
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        expect(resolveShortcut(press(key), choice)).toBeNull();
      }
      expect(resolveShortcut(press('PageDown'), choice)?.action).toBe('nextLoop');
      expect(resolveShortcut(press('PageUp'), choice)?.action).toBe('previousLoop');
      expect(resolveShortcut(press(' '), choice)?.action).toBe('togglePlay');
      expect(resolveShortcut(press('c'), choice)?.action).toBe('countIn');
    });
  });

  describe('with the overlay open', () => {
    const help: ShortcutContext = { focus: 'other', helpOpen: true, characterKeys: true };

    it('closes on Escape or ?', () => {
      expect(resolveShortcut(press('Escape'), help)).toEqual({ action: 'closeHelp', run: true });
      expect(resolveShortcut(press('?', { shiftKey: true }), help)).toEqual({
        action: 'help',
        run: true,
      });
    });

    it('takes no other shortcut, so Space presses its Close button and Tab stays its own', () => {
      for (const key of [...Object.keys(KEY_BINDINGS).filter((k) => k !== '?'), 'Tab', 'Enter']) {
        expect(resolveShortcut(press(key), help)).toBeNull();
      }
    });

    it('closes on Escape even while focus is in a field', () => {
      expect(
        resolveShortcut(press('Escape'), { focus: 'typing', helpOpen: true, characterKeys: true })
          ?.action,
      ).toBe('closeHelp');
    });
  });

  it('means nothing by Escape while the overlay is closed', () => {
    expect(resolveShortcut(press('Escape'), onPage)).toBeNull();
  });
});

describe('single-key shortcuts turned off (WCAG 2.1.4)', () => {
  const off: ShortcutContext = { focus: 'other', helpOpen: false, characterKeys: false };

  it.each(['m', 'M', 'd', 's', 'c'])('leaves %j to the page, so the browser keeps it', (key) => {
    expect(resolveShortcut(press(key), off)).toBeNull();
  });

  it('leaves ? to the page too: it is a punctuation character, which 2.1.4 covers', () => {
    expect(resolveShortcut(press('?', { shiftKey: true }), off)).toBeNull();
  });

  it.each([
    [' ', 'togglePlay'],
    ['ArrowUp', 'speedUp'],
    ['ArrowDown', 'speedDown'],
    ['ArrowLeft', 'previousLoop'],
    ['PageUp', 'previousLoop'],
    ['ArrowRight', 'nextLoop'],
    ['PageDown', 'nextLoop'],
  ])('keeps %j as %s: not a letter, number, punctuation or symbol key', (key, action) => {
    expect(resolveShortcut(press(key), off)).toEqual({ action, run: true });
  });

  it('still closes the overlay on Escape, but not on ?', () => {
    const help: ShortcutContext = { ...off, helpOpen: true };
    expect(resolveShortcut(press('Escape'), help)).toEqual({ action: 'closeHelp', run: true });
    expect(resolveShortcut(press('?', { shiftKey: true }), help)).toBeNull();
  });

  it('names as character keys exactly the bound keys that are one printable character', () => {
    expect([...CHARACTER_KEYS].sort()).toEqual(['?', 'c', 'd', 'm', 's']);
    expect(isCharacterKey(' ')).toBe(false);
    expect(isCharacterKey('PageDown')).toBe(false);
    expect(isCharacterKey('M')).toBe(true);
  });

  it('writes those keys out for the copy that names them', () => {
    expect(characterKeysLabel()).toBe('M, D, S, C and ?');
  });
});

describe('focusKindOf', () => {
  it.each([
    [{ tagName: 'INPUT', type: 'text' }, 'typing'],
    [{ tagName: 'INPUT' }, 'typing'],
    [{ tagName: 'input', type: 'number' }, 'typing'],
    [{ tagName: 'INPUT', type: 'search' }, 'typing'],
    [{ tagName: 'INPUT', type: 'email' }, 'typing'],
    [{ tagName: 'TEXTAREA' }, 'typing'],
    [{ tagName: 'SELECT' }, 'typing'],
    [{ tagName: 'DIV', isContentEditable: true }, 'typing'],
    [{ tagName: 'INPUT', type: 'range' }, 'slider'],
    [{ tagName: 'INPUT', type: 'checkbox' }, 'other'],
    [{ tagName: 'INPUT', type: 'radio' }, 'choice'],
    [{ tagName: 'BUTTON', role: 'menuitem' }, 'choice'],
    [{ tagName: 'DIV', role: 'radio' }, 'choice'],
    [{ tagName: 'BUTTON', role: 'tab' }, 'other'],
    [{ tagName: 'BUTTON', role: null }, 'other'],
    [{ tagName: 'INPUT', type: 'submit' }, 'other'],
    [{ tagName: 'INPUT', type: 'button' }, 'other'],
    [{ tagName: 'BUTTON' }, 'other'],
    [{ tagName: 'A' }, 'other'],
    [{ tagName: 'FORM' }, 'other'],
    [{ tagName: 'BODY' }, 'other'],
  ] as const)('%j is %s', (element, kind) => {
    expect(focusKindOf(element)).toBe(kind);
  });

  it('is other with nothing focused', () => {
    expect(focusKindOf(null)).toBe('other');
  });
});

describe('shortcutHelp', () => {
  it('has a row for every action, and only once', () => {
    expect([...HELP_ROW_ACTIONS].sort()).toEqual([...SHORTCUT_ACTIONS].sort());
  });

  it('lists every bound key in some row', () => {
    const shown = shortcutHelp().flatMap((row) => row.keys);
    expect(shown).toHaveLength(Object.keys(KEY_BINDINGS).length);
  });

  it('writes the keys the way they are printed', () => {
    const rows = Object.fromEntries(shortcutHelp().map((row) => [row.label, row.keys]));
    expect(rows['Play or pause']).toEqual(['Space']);
    expect(rows['Speed up or down 5%']).toEqual(['↑', '↓']);
    expect(rows['Metronome on or off']).toEqual(['M']);
    expect(rows['Show or hide these shortcuts']).toEqual(['?']);
    expect(
      shortcutHelp().find((row) => row.label.startsWith('Previous or next loop'))?.keys,
    ).toEqual(['←', 'Page Up', '→', 'Page Down']);
  });
});

describe('shortcutHelp with single-key shortcuts off', () => {
  it('lists no character key, and drops the rows left with none', () => {
    const rows = shortcutHelp({ characterKeys: false });
    const shown = rows.flatMap((row) => row.keys);
    for (const key of ['M', 'D', 'S', 'C', '?']) expect(shown).not.toContain(key);
    expect(rows.map((row) => row.label)).toEqual([
      'Play or pause',
      'Speed up or down 5%',
      'Previous or next loop (a bar back or on, when the song has no loops)',
    ]);
  });
});

describe('nextCountInBars', () => {
  it('cycles off, 1 bar, 2 bars, then off again', () => {
    expect(nextCountInBars(0)).toBe(1);
    expect(nextCountInBars(1)).toBe(2);
    expect(nextCountInBars(2)).toBe(0);
  });

  it('visits every option the controls bar offers', () => {
    const seen = new Set<number>();
    let bars: CountInBars = 0;
    for (let i = 0; i < COUNT_IN_BAR_OPTIONS.length; i++) {
      seen.add(bars);
      bars = nextCountInBars(bars);
    }
    expect([...seen].sort()).toEqual([...COUNT_IN_BAR_OPTIONS]);
  });
});

describe('neighbourLoop', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('steps to the next and previous loop', () => {
    expect(neighbourLoop(order, 'b', 'next')?.id).toBe('c');
    expect(neighbourLoop(order, 'b', 'previous')?.id).toBe('a');
  });

  it('stops at the ends rather than wrapping', () => {
    expect(neighbourLoop(order, 'c', 'next')).toBeNull();
    expect(neighbourLoop(order, 'a', 'previous')).toBeNull();
  });

  it('from no loop (jam mode), goes to the first with next and the last with previous', () => {
    expect(neighbourLoop(order, null, 'next')?.id).toBe('a');
    expect(neighbourLoop(order, null, 'previous')?.id).toBe('c');
  });

  it('treats a current loop that is not listed (deleted meanwhile) like no loop', () => {
    expect(neighbourLoop(order, 'gone', 'next')?.id).toBe('a');
    expect(neighbourLoop(order, 'gone', 'previous')?.id).toBe('c');
  });

  it('has nothing to give for no loops', () => {
    expect(neighbourLoop([], null, 'next')).toBeNull();
    expect(neighbourLoop([], 'a', 'previous')).toBeNull();
  });

  it('has nothing for the only loop when it is the one playing', () => {
    expect(neighbourLoop([{ id: 'a' }], 'a', 'next')).toBeNull();
    expect(neighbourLoop([{ id: 'a' }], 'a', 'previous')).toBeNull();
  });
});

describe('steppedBar', () => {
  it('moves a bar on or back', () => {
    expect(steppedBar(5, 16, 'next')).toBe(6);
    expect(steppedBar(5, 16, 'previous')).toBe(4);
  });

  it('has no bar before the first or after the last', () => {
    expect(steppedBar(1, 16, 'previous')).toBeNull();
    expect(steppedBar(16, 16, 'next')).toBeNull();
    expect(steppedBar(1, 1, 'next')).toBeNull();
  });
});

describe('shortcutAnnouncement', () => {
  const options: AnnouncedOptions = {
    speedRatio: 1,
    metronomeOn: false,
    drumsMuted: false,
    drumsOnly: false,
    countInBars: 0,
  };

  it.each([
    [{ speedRatio: 1.05 }, 'Speed 105%'],
    [{ speedRatio: 0.95 }, 'Speed 95%'],
    [{ metronomeOn: true }, 'Metronome on'],
    [{ drumsMuted: true }, 'Drums muted'],
    [{ drumsOnly: true }, 'Drums only on'],
    [{ countInBars: 1 as const }, 'Count-in 1 bar'],
    [{ countInBars: 2 as const }, 'Count-in 2 bars'],
  ])('says what changed: %o', (change, said) => {
    expect(shortcutAnnouncement(options, { ...options, ...change })).toBe(said);
  });

  it('says both when one key changes two (Drums only turns Mute drums off)', () => {
    expect(
      shortcutAnnouncement(
        { ...options, drumsMuted: true },
        { ...options, drumsMuted: false, drumsOnly: true },
      ),
    ).toBe('Drums unmuted, Drums only on');
  });

  it('says the way back too', () => {
    const on = { ...options, metronomeOn: true, drumsOnly: true, countInBars: 2 as const };
    expect(shortcutAnnouncement(on, options)).toBe('Metronome off, Drums only off, Count-in off');
  });

  it('says where a loop key moved first, alone or with what came with it', () => {
    expect(shortcutAnnouncement(options, options, 'Bar 5')).toBe('Bar 5');
    expect(shortcutAnnouncement(options, { ...options, speedRatio: 0.8 }, 'Loop Verse')).toBe(
      'Loop Verse, Speed 80%',
    );
  });

  it('says nothing when nothing changed, or only below what the percent shows', () => {
    expect(shortcutAnnouncement(options, options)).toBeNull();
    expect(shortcutAnnouncement(options, { ...options, speedRatio: 1.001 })).toBeNull();
  });
});
