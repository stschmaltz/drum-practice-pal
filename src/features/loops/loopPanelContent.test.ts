import { loopRow } from '@/test/loopTable';
import { editorOnPanel, panelShowsLoopSpeed } from './loopPanelContent';
import type { LoopEditor } from './useLoopPractice';

const verse = loopRow('verse');
const editor: LoopEditor = { loopId: null, bars: {}, awaitingEnd: false, saving: false };

describe('editorOnPanel and panelShowsLoopSpeed', () => {
  it.each([
    // [editor open, barCount, loop playing, form, loop speed]
    [false, 16, false, false, false],
    [false, 16, true, false, true],
    // The form replaces the list, and the playing loop's item with its speed.
    [true, 16, true, true, false],
    [true, 16, false, true, false],
    // Without the score's bars the form can't be drawn: the list stays.
    [true, null, true, false, true],
  ] as const)(
    'editor %s, %s bars, loop playing %s: form %s, loop speed %s',
    (editorOpen, barCount, playing, form, loopSpeed) => {
      const practice = { editor: editorOpen ? editor : null, activeLoop: playing ? verse : null };
      expect(editorOnPanel(practice, { barCount }) !== null).toBe(form);
      expect(panelShowsLoopSpeed(practice, { barCount })).toBe(loopSpeed);
    },
  );
});
