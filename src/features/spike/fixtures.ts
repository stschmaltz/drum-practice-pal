import groove120 from '../../../tests/fixtures/gp/groove-120.gp?url';
import tempoChange from '../../../tests/fixtures/gp/tempo-change.gp?url';
import multiTrack from '../../../tests/fixtures/gp/multi-track.gp?url';
import waltz34 from '../../../tests/fixtures/gp/waltz-34.gp?url';

export const SPIKE_FIXTURES = [
  { label: 'Groove 120 (16 bars, 4/4)', url: groove120 },
  { label: 'Tempo change (120 to 90 at bar 9)', url: tempoChange },
  { label: 'Multi-track (drums, bass, guitar)', url: multiTrack },
  { label: 'Waltz (3/4)', url: waltz34 },
] as const;
