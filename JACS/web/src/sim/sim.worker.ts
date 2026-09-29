// Runs the WebAssembly simulator off the main thread, so dragging parts never waits on a solve.

import createJacsModule from '../wasm/jacs.js';
import wasmUrl from '../wasm/jacs.wasm?url';
import type { Engine } from './engine';
import { makeEngine } from './engine';
import type { WorkerReply, WorkerRequest } from './messages';
import { isWorkerRequest } from './messages';

function reply(message: WorkerReply): void {
    self.postMessage(message);
}

async function loadEngine(): Promise<Engine> {
    const runtime = await createJacsModule({
        locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    });
    return makeEngine(runtime);
}

const engine = loadEngine();

engine.then(
    () => reply({ kind: 'ready' }),
    (error: unknown) => reply({ kind: 'failure', id: null, message: `WebAssembly failed to load: ${String(error)}` }),
);

async function handle(request: WorkerRequest): Promise<void> {
    try {
        const ready = await engine;
        reply({ kind: 'op', id: request.id, outcome: ready.operatingPoint(request.schematic) });
    } catch (error) {
        reply({ kind: 'failure', id: request.id, message: String(error) });
    }
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!isWorkerRequest(data)) {
        reply({ kind: 'failure', id: null, message: 'worker received a malformed request' });
        return;
    }
    void handle(data);
});
