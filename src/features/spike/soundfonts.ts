export interface SoundFontOption {
  label: string;
  /** Path served from public/ */
  url: string;
  /** False when the file has to be added by hand (see docs/units/01-spike.md, "Needs approval") */
  shipped: boolean;
}

/** Folder for candidate soundfonts dropped in by hand. Gitignored until one is picked. */
export const CANDIDATE_DIR = '/sf-candidates';

export const SOUND_FONTS: SoundFontOption[] = [
  { label: 'Sonivox (sf2, ships with alphaTab)', url: '/soundfont/sonivox.sf2', shipped: true },
  { label: 'Sonivox (sf3, ships with alphaTab)', url: '/soundfont/sonivox.sf3', shipped: true },
  { label: 'GeneralUser GS (sf2)', url: `${CANDIDATE_DIR}/GeneralUser-GS.sf2`, shipped: false },
  {
    label: 'MuseScore General (sf3)',
    url: `${CANDIDATE_DIR}/MuseScore_General.sf3`,
    shipped: false,
  },
  { label: 'FluidR3Mono GM (sf3)', url: `${CANDIDATE_DIR}/FluidR3Mono_GM.sf3`, shipped: false },
];

export const DEFAULT_SOUND_FONT_URL = '/soundfont/sonivox.sf2';

/** Only same-origin paths, so the spike can't be pointed at an arbitrary remote file. */
export function isLocalSoundFontPath(path: string): boolean {
  return /^\/(?!\/)[\w./-]+\.sf[23]$/i.test(path) && !path.includes('..');
}
