import { render, screen } from '@testing-library/react';
import { loopRow } from '@/test/loopTable';
import { LoopSavedNote } from './LoopSavedNote';

const verse = loopRow('loop-a', { name: 'Verse' });
const note = () => screen.getByTestId('loop-saved-note');

describe('LoopSavedNote', () => {
  it('is an empty status region before anything is saved', () => {
    render(
      <LoopSavedNote saved={null} count={0}>
        {null}
      </LoopSavedNote>,
    );
    expect(note()).toHaveAttribute('role', 'status');
    expect(note()).toBeEmptyDOMElement();
  });

  it('names the loop saved, with the way to it', () => {
    render(
      <LoopSavedNote saved={verse} count={1}>
        <a href="/verse">Practise it</a>
      </LoopSavedNote>,
    );
    expect(note()).toHaveTextContent('Saved “Verse”. Practise it or pick bars for another.');
  });

  it('two loops saved under one name are two different sayings, so the second is read too', () => {
    const view = render(
      <LoopSavedNote saved={verse} count={1}>
        <a href="/verse">Practise it</a>
      </LoopSavedNote>,
    );
    const region = note();
    const first = region.textContent;

    view.rerender(
      <LoopSavedNote saved={loopRow('loop-b', { name: 'Verse' })} count={2}>
        <a href="/verse-2">Practise it</a>
      </LoopSavedNote>,
    );

    expect(note()).toBe(region);
    expect(region.textContent).not.toBe(first);
    expect(region).toHaveTextContent('Saved “Verse”.');
  });
});
