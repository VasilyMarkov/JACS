import { nextElementId, nextPartId, rotatedPart, samePoint } from './geometry';
import type { ElementRef, Part, PartType, Point, Rotation, Schematic } from './types';

// Every edit returns a new schematic and leaves its input untouched.

export const DEFAULT_VALUE: Readonly<Record<PartType, number>> = {
    resistor: 1000,
    vsource: 5,
};

export interface Added {
    readonly schematic: Schematic;
    readonly id: string;
}

export function addPart(schematic: Schematic, type: PartType, origin: Point, rotation: Rotation): Added {
    const part: Part = { id: nextPartId(schematic.parts, type), type, value: DEFAULT_VALUE[type], origin, rotation };
    return { schematic: { ...schematic, parts: [...schematic.parts, part] }, id: part.id };
}

/** Adds a wire, ignoring zero-length and duplicate wires. */
export function addWire(schematic: Schematic, a: Point, b: Point): Added | null {
    if (samePoint(a, b)) {
        return null;
    }
    const duplicate = schematic.wires.some(
        (wire) => (samePoint(wire.a, a) && samePoint(wire.b, b)) || (samePoint(wire.a, b) && samePoint(wire.b, a)),
    );
    if (duplicate) {
        return null;
    }
    const id = nextElementId('w', schematic.wires);
    return { schematic: { ...schematic, wires: [...schematic.wires, { id, a, b }] }, id };
}

export function addGround(schematic: Schematic, at: Point): Added | null {
    if (schematic.grounds.some((ground) => samePoint(ground.at, at))) {
        return null;
    }
    const id = nextElementId('g', schematic.grounds);
    return { schematic: { ...schematic, grounds: [...schematic.grounds, { id, at }] }, id };
}

export function removeElement(schematic: Schematic, ref: ElementRef): Schematic {
    switch (ref.kind) {
        case 'part':
            return { ...schematic, parts: schematic.parts.filter((part) => part.id !== ref.id) };
        case 'wire':
            return { ...schematic, wires: schematic.wires.filter((wire) => wire.id !== ref.id) };
        case 'ground':
            return { ...schematic, grounds: schematic.grounds.filter((ground) => ground.id !== ref.id) };
    }
}

export function setPartValue(schematic: Schematic, id: string, value: number): Schematic {
    return { ...schematic, parts: schematic.parts.map((part) => (part.id === id ? { ...part, value } : part)) };
}

export function rotatePart(schematic: Schematic, id: string): Schematic {
    return { ...schematic, parts: schematic.parts.map((part) => (part.id === id ? rotatedPart(part) : part)) };
}

export function translateElement(schematic: Schematic, ref: ElementRef, dx: number, dy: number): Schematic {
    if (dx === 0 && dy === 0) {
        return schematic;
    }
    const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
    switch (ref.kind) {
        case 'part':
            return {
                ...schematic,
                parts: schematic.parts.map((part) => (part.id === ref.id ? { ...part, origin: move(part.origin) } : part)),
            };
        case 'wire':
            return {
                ...schematic,
                wires: schematic.wires.map((wire) => (wire.id === ref.id ? { ...wire, a: move(wire.a), b: move(wire.b) } : wire)),
            };
        case 'ground':
            return {
                ...schematic,
                grounds: schematic.grounds.map((ground) => (ground.id === ref.id ? { ...ground, at: move(ground.at) } : ground)),
            };
    }
}
