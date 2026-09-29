import type { AnalysisRequest, OpResult, Outcome, SchematicDto } from './protocol';
import { parseOpResponse } from './protocol';

/** What the WebAssembly module exposes: the `run` function bound with Embind in src/bindings.cpp. */
export interface JacsRuntime {
    run(request: string): string;
}

/** Typed access to the simulator. It does not care whether the runtime lives in a worker or in Node. */
export interface Engine {
    operatingPoint(schematic: SchematicDto): Outcome<OpResult>;
}

export function makeEngine(runtime: JacsRuntime): Engine {
    const call = (request: AnalysisRequest): string => runtime.run(JSON.stringify(request));
    return {
        operatingPoint: (schematic) => parseOpResponse(call({ analysis: 'op', schematic })),
    };
}
