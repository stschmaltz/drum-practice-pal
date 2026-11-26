import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 bar' },
  { value: 2, label: '2 bars' },
] as const;

function Bars({
  initial = 0,
  disabled = false,
  onChange = () => {},
}: {
  initial?: 0 | 1 | 2;
  disabled?: boolean;
  onChange?: (value: 0 | 1 | 2) => void;
}) {
  const [value, setValue] = useState<0 | 1 | 2>(initial);
  return (
    <>
      <span id="bars-label">Count-in</span>
      <p id="bars-note">Before the song starts.</p>
      <SegmentedControl
        labelledBy="bars-label"
        describedBy="bars-note"
        options={OPTIONS}
        value={value}
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

const group = () => screen.getByRole('radiogroup', { name: 'Count-in' });
const radio = (name: string) => within(group()).getByRole('radio', { name });

describe('SegmentedControl', () => {
  it('is one radio group of native radios, named by the words beside it, with the value checked', () => {
    render(<Bars initial={1} />);
    expect(group()).toHaveAccessibleDescription('Before the song starts.');
    const radios = within(group()).getAllByRole('radio');
    expect(radios.map((each) => each.tagName)).toEqual(['INPUT', 'INPUT', 'INPUT']);
    // One name, so the browser treats them as one group (one Tab stop, arrows move).
    expect(new Set(radios.map((each) => each.getAttribute('name'))).size).toBe(1);
    expect(radios.map((each) => (each as HTMLInputElement).checked)).toEqual([false, true, false]);
  });

  it('takes a label instead when there are no words on screen to point at', () => {
    render(<SegmentedControl label="When" options={OPTIONS} value={0} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'When' })).toBeInTheDocument();
  });

  it('a press on a choice’s label chooses it, handing back the option’s own value (a number here)', async () => {
    const onChange = vi.fn();
    render(<Bars onChange={onChange} />);
    await userEvent.setup().click(screen.getByText('2 bars'));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(radio('2 bars')).toBeChecked();
  });

  it('the arrow keys move the choice from the focused radio', async () => {
    const onChange = vi.fn();
    render(<Bars onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(radio('Off'));
    await user.keyboard('{ArrowRight}');
    expect(radio('1 bar')).toBeChecked();
    expect(radio('1 bar')).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('disabled, every choice is off and a press changes nothing', async () => {
    const onChange = vi.fn();
    render(<Bars disabled onChange={onChange} />);
    for (const each of within(group()).getAllByRole('radio')) expect(each).toBeDisabled();
    await userEvent.setup().click(screen.getByText('1 bar'));
    expect(onChange).not.toHaveBeenCalled();
    expect(radio('Off')).toBeChecked();
  });
});
