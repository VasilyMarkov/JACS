import { isFiniteNumber, isRecord } from '../model/guards';
import type { OpResult, Outcome, SchematicDto } from './protocol';

// Messages exchanged between the main thread and the simulation worker.

export interface WorkerRequest {
    readonly kind: 'op';
    readonly id: number;
    readonly schematic: SchematicDto;
}

export type WorkerReply =
    | { readonly kind: 'ready' }
    | { readonly kind: 'op'; readonly id: number; readonly outcome: Outcome<OpResult> }
    /** The worker itself broke (WebAssembly failed to load, or a request was malformed). */
    | { readonly kind: 'failure'; readonly id: number | null; readonly message: string };

/** Structural check only; the simulator validates the schematic's content. */
export function isWorkerRequest(value: unknown): value is WorkerRequest {
    if (!isRecord(value) || !isFiniteNumber(value['id']) || !isRecord(value['schematic'])) {
        return false;
    }
    return value['kind'] === 'op';
}
