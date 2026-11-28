import {
  canChangeOptions,
  canPlay,
  canPlayLoopPractice,
  canSetLoopPracticeSpeed,
  canUseDrumToggles,
} from './controlGates';
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

describe('canPlayLoopPractice', () => {
  it.each<[PlayerStatus, boolean, boolean]>([
    // 16 Test bug 1: the sounds are in before the loop is open; Play would play the whole song.
    ['ready', false, false],
    ['ready', true, true],
    ['loading', true, false],
    ['error', true, false],
    // Already running: Pause stays reachable whatever the loop.
    ['playing', false, true],
    ['countingIn', false, true],
  ])('under %s with the loop open %s is %s', (status, loopOpen, can) => {
    expect(canPlayLoopPractice(player, snapshot(status), loopOpen)).toBe(can);
  });

  it('is false with no player', () => {
    expect(canPlayLoopPractice(null, snapshot('ready'), true)).toBe(false);
  });
});

describe('canSetLoopPracticeSpeed', () => {
  it.each<[PlayerStatus, boolean, boolean]>([
    // Unit 20 Review: a speed set before the loop is open is dropped when the loop opens.
    ['loading', false, false],
    ['ready', false, false],
    ['playing', false, false],
    ['loading', true, true],
    ['ready', true, true],
    ['playing', true, true],
    ['countingIn', true, true],
    ['error', true, false],
  ])('under %s with the loop open %s is %s', (status, loopOpen, can) => {
    expect(canSetLoopPracticeSpeed(player, snapshot(status), loopOpen)).toBe(can);
  });

  it('is false with no player', () => {
    expect(canSetLoopPracticeSpeed(null, snapshot('ready'), true)).toBe(false);
  });
});
