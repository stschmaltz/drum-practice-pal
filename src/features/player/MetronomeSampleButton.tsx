import { useEffect, useRef } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { buttonClass } from '@/components/styles';
import { failureCopy } from '@/lib/errorCopy';
import { isSameVoice, type MetronomeVoice } from './metronomeSounds';
import { useMetronomeSample, type SampleRenderer } from './useMetronomeSample';

/**
 * "Play sample": two bars of the voice being chosen, at the volume being
 * chosen, through the player's own sounds. Choosing another sound while it
 * plays plays that one instead, so sounds can be compared one after another,
 * and moving the volume changes the sample as it plays.
 */
export function MetronomeSampleButton({
  voice,
  volume,
  render,
}: {
  voice: MetronomeVoice;
  /** 0 to 1. */
  volume: number;
  /** Tests pass a fake; the app renders with alphaTab. */
  render?: SampleRenderer;
}) {
  const sample = useMetronomeSample(render);
  const active = sample.state === 'loading' || sample.state === 'playing';

  // The latest inputs, for the effect below, which should run only when the voice changes.
  const latest = useRef({ voice, volume, active, play: sample.play });
  latest.current = { voice, volume, active, play: sample.play };
  const playedVoice = useRef(voice);
  useEffect(() => {
    if (isSameVoice(playedVoice.current, voice)) return;
    playedVoice.current = voice;
    const { active: sounding, play, volume: level } = latest.current;
    // The context was unlocked by the tap that started the sample, so this needs no gesture.
    if (sounding) play(voice, level);
  }, [voice]);

  // The slider is heard as it moves, without starting the sample again.
  const { setVolume } = sample;
  useEffect(() => setVolume(volume), [setVolume, volume]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={`${buttonClass} w-fit`}
        onClick={() => {
          if (active) {
            sample.stop();
            return;
          }
          playedVoice.current = voice;
          sample.play(voice, volume);
        }}
      >
        <Icon name={active ? 'pause' : 'play'} />
        {active ? 'Stop sample' : 'Play sample'}
      </button>
      {sample.state === 'failed' && (
        <ErrorAlert>Couldn't play the sample. {failureCopy(sample.error)}</ErrorAlert>
      )}
    </div>
  );
}
