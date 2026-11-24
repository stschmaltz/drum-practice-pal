import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { applyWaitingUpdate, resetUpdateWaiting } from './appUpdate';
import { registerServiceWorker } from './registerServiceWorker';

const registration = vi.hoisted(() => ({
  options: null as RegisterSWOptions | null,
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: RegisterSWOptions) => {
    registration.options = options;
    return registration.updateServiceWorker;
  },
}));

const reload = vi.fn();

beforeEach(() => {
  registration.options = null;
  registration.updateServiceWorker.mockClear();
  reload.mockClear();
  vi.stubGlobal('location', { ...window.location, reload });
  resetUpdateWaiting();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** What vite-plugin-pwa does in a tab when a new build is waiting, and when it has taken over. */
const newBuildWaits = () => registration.options?.onNeedRefresh?.();
const newBuildTakesOver = () => registration.options?.onNeedReload?.();

// Bug hunt S1: the plugin's own default reloads every tab the new build takes over, so
// "Reload to update" pressed in one tab reloaded another in the middle of practice.
describe('a new build of the app', () => {
  it('reloads the tab whose "Reload to update" was pressed, once the build has taken over', () => {
    registerServiceWorker();
    newBuildWaits();

    applyWaitingUpdate();
    expect(registration.updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    newBuildTakesOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves another tab playing, still offering the reload, which then reloads it', () => {
    registerServiceWorker();
    newBuildWaits();

    // Pressed in some other tab: this one only hears the new build take over.
    newBuildTakesOver();
    expect(reload).not.toHaveBeenCalled();

    applyWaitingUpdate();
    // The new build is no longer waiting, so asking it to take over would do nothing.
    expect(registration.updateServiceWorker).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
