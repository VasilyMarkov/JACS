type Listener<T> = (payload: T) => void;

/** A minimal typed event emitter; `Events` maps each event name to its payload type. */
export class Emitter<Events extends object> {
    private readonly listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

    on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
        (this.listeners[event] ??= []).push(listener);
    }

    protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        for (const listener of this.listeners[event] ?? []) {
            listener(payload);
        }
    }
}
