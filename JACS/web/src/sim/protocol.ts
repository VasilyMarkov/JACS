import { isArrayOf, isFiniteNumber, isRecord, isString } from '../model/guards';
import type { PartType, Point } from '../model/types';

// The JSON protocol spoken by the C++ simulator (see src/schematic.hpp), with a validating parser
// for everything that comes back, since it crosses the WebAssembly boundary as an untyped string.

export interface ComponentDto {
    readonly id: string;
    readonly type: PartType;
    readonly value: number;
    readonly a: Point;
    readonly b: Point;
}

export interface SchematicDto {
    readonly components: readonly ComponentDto[];
    readonly wires: readonly { readonly a: Point; readonly b: Point }[];
    readonly grounds: readonly Point[];
}

export interface AnalysisRequest {
    readonly analysis: 'op';
    readonly schematic: SchematicDto;
}

/** Quantities are measured from terminal a to terminal b; power is absorbed (negative when delivering). */
export interface ComponentResult {
    readonly id: string;
    readonly nodeA: number;
    readonly nodeB: number;
    readonly voltage: number;
    readonly current: number;
    readonly power: number;
}

export interface OpResult {
    /** Indexed by node id; node 0 is ground. */
    readonly nodeVoltages: readonly number[];
    readonly components: readonly ComponentResult[];
    /** Node of each input wire, or -1 for a wire that touches nothing. */
    readonly wires: readonly number[];
}

export type Outcome<T> = { readonly ok: true; readonly result: T } | { readonly ok: false; readonly error: string };

export class ProtocolError extends Error {
    override readonly name = 'ProtocolError';
}

// The C++ side serialises NaN and infinity as null, so a null number is read back as NaN.
function isNumberOrNull(value: unknown): value is number | null {
    return value === null || isFiniteNumber(value);
}

function numbers(value: unknown, what: string): number[] {
    if (!isArrayOf(value, isNumberOrNull)) {
        throw new ProtocolError(`${what}: expected an array of numbers`);
    }
    return value.map((entry) => entry ?? Number.NaN);
}

function number(value: unknown, what: string): number {
    if (!isNumberOrNull(value)) {
        throw new ProtocolError(`${what}: expected a number`);
    }
    return value ?? Number.NaN;
}

function text(value: unknown, what: string): string {
    if (!isString(value)) {
        throw new ProtocolError(`${what}: expected a string`);
    }
    return value;
}

function records(value: unknown, what: string): readonly Readonly<Record<string, unknown>>[] {
    if (!isArrayOf(value, isRecord)) {
        throw new ProtocolError(`${what}: expected an array of objects`);
    }
    return value;
}

function parseEnvelope(json: string, analysis: string): Outcome<Readonly<Record<string, unknown>>> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        throw new ProtocolError(`response is not JSON: ${String(error)}`);
    }
    if (!isRecord(parsed) || typeof parsed['ok'] !== 'boolean') {
        throw new ProtocolError('response has no "ok" flag');
    }
    if (!parsed['ok']) {
        return { ok: false, error: text(parsed['error'], 'error') };
    }
    if (parsed['analysis'] !== analysis) {
        throw new ProtocolError(`expected a "${analysis}" response, got ${String(parsed['analysis'])}`);
    }
    return { ok: true, result: parsed };
}

export function parseOpResponse(json: string): Outcome<OpResult> {
    const envelope = parseEnvelope(json, 'op');
    if (!envelope.ok) {
        return envelope;
    }
    const body = envelope.result;
    const wires = numbers(body['wires'], 'wires');
    return {
        ok: true,
        result: {
            nodeVoltages: numbers(body['nodeVoltages'], 'nodeVoltages'),
            components: records(body['components'], 'components').map((c) => ({
                id: text(c['id'], 'component id'),
                nodeA: number(c['nodeA'], 'nodeA'),
                nodeB: number(c['nodeB'], 'nodeB'),
                voltage: number(c['voltage'], 'voltage'),
                current: number(c['current'], 'current'),
                power: number(c['power'], 'power'),
            })),
            wires,
        },
    };
}
