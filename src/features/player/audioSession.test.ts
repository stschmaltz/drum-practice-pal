import { preferPlaybackAudioSession } from './audioSession';

describe('preferPlaybackAudioSession', () => {
  it('switches the audio session to playback so the ringer switch does not mute it', () => {
    const nav = { audioSession: { type: 'auto' } };
    preferPlaybackAudioSession(nav);
    expect(nav.audioSession.type).toBe('playback');
  });

  it('does nothing where the API is missing', () => {
    expect(() => preferPlaybackAudioSession({})).not.toThrow();
    expect(() => preferPlaybackAudioSession(undefined)).not.toThrow();
  });
});
