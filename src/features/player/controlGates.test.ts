import { canChangeOptions, canPlay, canUseDrumToggles } from './controlGates';
import { DEFAULT_PLAYER_OPTIONS } from './playerOptions';
import { initialPlayerSnapshot, type PlayerService, type PlayerStatus } from './PlayerService';

// The gates only ask whether there is a player; what it is doesn't matter here.
const player = {} as PlayerService;
const snapshot = (status: PlayerStatus, drumTrackIndex: number | null = 2) => ({
  ...initialPlayerSnapshot(drumTrackIndex, DEFAULT_PLAYER_OPTIONS),
  status,
});

describe('canChangeOptions', () => {
  it.each<[PlayerStatus, boolean]>([
    // Before the song is ready too: a speed or count-in chosen while it loads is kept.
    ['loading', true],
    ['ready', true],
    ['countingIn', true],
    ['playing', true],
    // 05 QA issue 3: after a failure nothing will play, so nothing moves.
    ['error', false],
  ])('under %s is %s', (status, can) => {
    expect(canChangeOptions(player, snapshot(status))).toBe(can);
  });

  it('is false with no player, whatever the status', () => {
    expect(canChangeOptions(null, snapshot('ready'))).toBe(false);
  });
});

describe('canUseDrumToggles', () => {
  it('needs a drum track and a player that has not failed', () => {
    expect(canUseDrumToggles(player, snapshot('ready'))).toBe(true);
    expect(canUseDrumToggles(player, snapshot('loading'))).toBe(true);
    expect(canUseDrumToggles(player, snapshot('ready', null))).toBe(false);
    expect(canUseDrumToggles(player, snapshot('error'))).toBe(false);
    expect(canUseDrumToggles(null, snapshot('ready'))).toBe(false);
  });
});

describe('canPlay', () => {
  it.each<[PlayerStatus, boolean]>([
    ['loading', false],
    ['ready', true],
    ['countingIn', true],
    ['playing', true],
    ['error', false],
  ])('under %s is %s', (status, can) => {
    expect(canPlay(player, snapshot(status))).toBe(can);
  });
});
