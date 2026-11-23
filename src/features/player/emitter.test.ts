import { createEmitter } from './emitter';

type Events = {
  tick: number;
  done: undefined;
};

describe('createEmitter', () => {
  it('delivers payloads to every handler of that event only', () => {
    const emitter = createEmitter<Events>();
    const ticks: number[] = [];
    const done = vi.fn();
    emitter.on('tick', (tick) => ticks.push(tick));
    emitter.on('tick', (tick) => ticks.push(tick * 10));
    emitter.on('done', done);

    emitter.emit('tick', 2);

    expect(ticks).toEqual([2, 20]);
    expect(done).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn();
    const off = emitter.on('tick', handler);
    off();
    emitter.emit('tick', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('still calls later handlers when one unsubscribes itself', () => {
    const emitter = createEmitter<Events>();
    const second = vi.fn();
    const off = emitter.on('tick', () => off());
    emitter.on('tick', second);
    emitter.emit('tick', 1);
    expect(second).toHaveBeenCalledWith(1);
  });

  it('drops every handler on clear', () => {
    const emitter = createEmitter<Events>();
    const handler = vi.fn();
    emitter.on('done', handler);
    emitter.clear();
    emitter.emit('done', undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});
