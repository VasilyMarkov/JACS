/** A position on the schematic grid. Coordinates are integers once placed. */
export interface Point {
    readonly x: number;
    readonly y: number;
}

export type PartType = 'resistor' | 'vsource';
export type Rotation = 0 | 90 | 180 | 270;

/** A two-terminal component. `origin` is terminal `a`; for a voltage source that is the + pole. */
export interface Part {
    readonly id: string;
    readonly type: PartType;
    readonly value: number;
    readonly origin: Point;
    readonly rotation: Rotation;
}

export interface Wire {
    readonly id: string;
    readonly a: Point;
    readonly b: Point;
}

export interface Ground {
    readonly id: string;
    readonly at: Point;
}

/** The whole document. Values are never mutated, so an undo history is just a list of these. */
export interface Schematic {
    readonly parts: readonly Part[];
    readonly wires: readonly Wire[];
    readonly grounds: readonly Ground[];
}

export type ElementKind = 'part' | 'wire' | 'ground';

export interface ElementRef {
    readonly kind: ElementKind;
    readonly id: string;
}

export const EMPTY_SCHEMATIC: Schematic = { parts: [], wires: [], grounds: [] };

export const PART_LABEL: Readonly<Record<PartType, string>> = {
    resistor: 'Resistor',
    vsource: 'Voltage source',
};

export const PART_UNIT: Readonly<Record<PartType, string>> = {
    resistor: 'Ω',
    vsource: 'V',
};

export const PART_ID_PREFIX: Readonly<Record<PartType, string>> = {
    resistor: 'R',
    vsource: 'V',
};

export function isPartType(value: unknown): value is PartType {
    return value === 'resistor' || value === 'vsource';
}

export function isRotation(value: unknown): value is Rotation {
    return value === 0 || value === 90 || value === 180 || value === 270;
}
