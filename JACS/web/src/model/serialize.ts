import { isArrayOf, isFiniteNumber, isPoint, isRecord, isString } from './guards';
import type { Ground, Part, Schematic, Wire } from './types';
import { isPartType, isRotation } from './types';

const FORMAT = 'jacs-schematic';
const VERSION = 1;

export function serializeSchematic(schematic: Schematic): string {
    return JSON.stringify({ format: FORMAT, version: VERSION, ...schematic }, null, 2);
}

function isPart(value: unknown): value is Part {
    return (
        isRecord(value) &&
        isString(value['id']) &&
        isPartType(value['type']) &&
        isFiniteNumber(value['value']) &&
        isPoint(value['origin']) &&
        isRotation(value['rotation'])
    );
}

function isWire(value: unknown): value is Wire {
    return isRecord(value) && isString(value['id']) && isPoint(value['a']) && isPoint(value['b']);
}

function isGround(value: unknown): value is Ground {
    return isRecord(value) && isString(value['id']) && isPoint(value['at']);
}

function hasUniqueIds(elements: readonly { readonly id: string }[]): boolean {
    return new Set(elements.map((element) => element.id)).size === elements.length;
}

/** Reads a saved schematic, or returns null when the text is not a valid one. */
export function parseSchematic(text: string): Schematic | null {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!isRecord(data) || data['format'] !== FORMAT || data['version'] !== VERSION) {
        return null;
    }
    const { parts, wires, grounds } = data;
    if (!isArrayOf(parts, isPart) || !isArrayOf(wires, isWire) || !isArrayOf(grounds, isGround)) {
        return null;
    }
    if (!hasUniqueIds(parts) || !hasUniqueIds(wires) || !hasUniqueIds(grounds)) {
        return null;
    }
    return { parts, wires, grounds };
}
