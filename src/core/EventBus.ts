type Handler<P> = (payload: P) => void;

/** Типизированная шина событий — основной способ связи между независимыми механиками. */
export class EventBus<E extends object> {
  private _handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(key: K, fn: Handler<E[K]>): () => void {
    let set = this._handlers.get(key);
    if (!set) this._handlers.set(key, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(key: K, ...args: E[K] extends void ? [] : [E[K]]): void {
    const set = this._handlers.get(key);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<unknown>)(args[0]);
  }
}
