import type { WorkerReply, WorkerRequest } from './messages';
import type { OpResult, Outcome, SchematicDto } from './protocol';

interface Pending {
    readonly onReply: (reply: WorkerReply) => void;
    readonly onError: (error: Error) => void;
}

/** Main-thread handle on the simulation worker. Requests are answered in the order they were sent. */
export class SimClient {
    private readonly worker: Worker;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;
    /** Settles once WebAssembly is loaded, and rejects if it could not be. */
    readonly ready: Promise<void>;

    constructor() {
        this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
        this.ready = new Promise<void>((resolve, reject) => {
            const onReply = (event: MessageEvent<WorkerReply>): void => {
                const message = event.data;
                if (message.kind === 'ready') {
                    resolve();
                } else if (message.kind === 'failure' && message.id === null) {
                    reject(new Error(message.message));
                }
            };
            this.worker.addEventListener('message', onReply);
        });
        // Nobody may be awaiting `ready` when it fails; the failure still reaches every request.
        this.ready.catch(() => undefined);

        this.worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => this.dispatch(event.data));
        this.worker.addEventListener('error', (event) => this.failAll(new Error(event.message || 'simulation worker crashed')));
        this.worker.addEventListener('messageerror', () => this.failAll(new Error('simulation worker sent an unreadable message')));
    }

    operatingPoint(schematic: SchematicDto): Promise<Outcome<OpResult>> {
        return this.request((id) => ({ kind: 'op', id, schematic }), (reply) => (reply.kind === 'op' ? reply.outcome : undefined));
    }

    dispose(): void {
        this.worker.terminate();
        this.failAll(new Error('simulation worker was disposed'));
    }

    private request<T>(
        build: (id: number) => WorkerRequest,
        pick: (reply: WorkerReply) => Outcome<T> | undefined,
    ): Promise<Outcome<T>> {
        const id = this.nextId++;
        return new Promise<Outcome<T>>((resolve, reject) => {
            this.pending.set(id, {
                onReply: (reply) => {
                    if (reply.kind === 'failure') {
                        reject(new Error(reply.message));
                        return;
                    }
                    const outcome = pick(reply);
                    if (outcome === undefined) {
                        reject(new Error(`unexpected "${reply.kind}" reply`));
                    } else {
                        resolve(outcome);
                    }
                },
                onError: reject,
            });
            this.worker.postMessage(build(id));
        });
    }

    private dispatch(reply: WorkerReply): void {
        if (reply.kind === 'ready') {
            return;
        }
        if (reply.id === null) {
            this.failAll(new Error(reply.kind === 'failure' ? reply.message : 'worker failure'));
            return;
        }
        const pending = this.pending.get(reply.id);
        if (pending !== undefined) {
            this.pending.delete(reply.id);
            pending.onReply(reply);
        }
    }

    private failAll(error: Error): void {
        for (const pending of this.pending.values()) {
            pending.onError(error);
        }
        this.pending.clear();
    }
}
