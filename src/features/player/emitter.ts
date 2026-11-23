/**
 * A small typed event emitter: `on` returns its own unsubscribe, so callers
 * (effects especially) can clean up without keeping the handler around.
 */

export type EventMap = Record<string, unknown>;

export type Handler<T> = (payload: T) => void;

export interface Emitter<Events extends EventMap> {
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void;
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  clear(): void;
}

export function createEmitter<Events extends EventMap>(): Emitter<Events> {
  const handlers = new Map<keyof Events, Set<Handler<never>>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as Handler<never>);
      return () => {
        set.delete(handler as Handler<never>);
      };
    },
    emit(event, payload) {
      // A copy, so a handler that unsubscribes itself doesn't skip the next one.
      for (const handler of [...(handlers.get(event) ?? [])]) {
        (handler as Handler<typeof payload>)(payload);
      }
    },
    clear() {
      handlers.clear();
    },
  };
}
