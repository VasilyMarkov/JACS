import type { Point } from './types';

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

export function isPoint(value: unknown): value is Point {
    return isRecord(value) && Number.isInteger(value['x']) && Number.isInteger(value['y']);
}

export function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
    return Array.isArray(value) && value.every(guard);
}
