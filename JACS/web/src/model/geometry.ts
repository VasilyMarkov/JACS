import type { SchematicDto } from '../sim/protocol';
import type { ElementRef, Part, PartType, Point, Rotation, Schematic } from './types';
import { PART_ID_PREFIX } from './types';

/** Length of every two-terminal part, in grid units. */
export const PART_LENGTH = 4;
/** How far the ground symbol reaches below its connection point, in grid units. */
export const GROUND_DROP = 1.5;

const DIRECTION: Readonly<Record<Rotation, Point>> = {
    0: { x: 1, y: 0 },
    90: { x: 0, y: 1 },
    180: { x: -1, y: 0 },
    270: { x: 0, y: -1 },
};

const NEXT_ROTATION: Readonly<Record<Rotation, Rotation>> = { 0: 90, 90: 180, 180: 270, 270: 0 };

export function direction(rotation: Rotation): Point {
    return DIRECTION[rotation];
}

export function nextRotation(rotation: Rotation): Rotation {
    return NEXT_ROTATION[rotation];
}

export function samePoint(a: Point, b: Point): boolean {
    return a.x === b.x && a.y === b.y;
}

export function pointKey(p: Point): string {
    return `${p.x},${p.y}`;
}

/** Rounds to the nearest grid line, normalising -0. */
export function snap(value: number): number {
    return Math.round(value) || 0;
}

export function snapPoint(p: Point): Point {
    return { x: snap(p.x), y: snap(p.y) };
}

export function partPins(part: Part): readonly [Point, Point] {
    const d = direction(part.rotation);
    return [part.origin, { x: part.origin.x + d.x * PART_LENGTH, y: part.origin.y + d.y * PART_LENGTH }];
}

export function partCenter(part: Part): Point {
    const [a, b] = partPins(part);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Turns a part a quarter turn clockwise around its centre, which stays on the grid. */
export function rotatedPart(part: Part): Part {
    const center = partCenter(part);
    const rotation = nextRotation(part.rotation);
    const d = direction(rotation);
    return {
        ...part,
        rotation,
        origin: { x: center.x - (d.x * PART_LENGTH) / 2, y: center.y - (d.y * PART_LENGTH) / 2 },
    };
}

/** Projects `to` onto the dominant axis through `from`, so every wire stays horizontal or vertical. */
export function axisAligned(from: Point, to: Point): Point {
    return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when `p` is on the axis-aligned segment a-b, ends included. */
export function onSegment(p: Point, a: Point, b: Point): boolean {
    return (
        Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
    );
}

/** The topmost element under `p` (grid coordinates, may be fractional), or null. */
export function hitTest(schematic: Schematic, p: Point): ElementRef | null {
    for (const part of [...schematic.parts].reverse()) {
        const [a, b] = partPins(part);
        if (distanceToSegment(p, a, b) <= 0.6) {
            return { kind: 'part', id: part.id };
        }
    }
    for (const ground of schematic.grounds) {
        const below = { x: ground.at.x, y: ground.at.y + GROUND_DROP };
        if (distanceToSegment(p, ground.at, below) <= 0.7) {
            return { kind: 'ground', id: ground.id };
        }
    }
    for (const wire of [...schematic.wires].reverse()) {
        if (distanceToSegment(p, wire.a, wire.b) <= 0.4) {
            return { kind: 'wire', id: wire.id };
        }
    }
    return null;
}

/**
 * Points where three or more conductors meet. Wires only connect at their ends or at a point that
 * lies on them, so the editor draws a dot at each of these and nowhere else.
 */
export function junctionPoints(schematic: Schematic): Point[] {
    const ends = new Map<string, { readonly point: Point; degree: number }>();
    const touch = (p: Point): void => {
        const key = pointKey(p);
        const entry = ends.get(key);
        if (entry === undefined) {
            ends.set(key, { point: p, degree: 1 });
        } else {
            entry.degree += 1;
        }
    };
    for (const wire of schematic.wires) {
        touch(wire.a);
        touch(wire.b);
    }
    for (const part of schematic.parts) {
        const [a, b] = partPins(part);
        touch(a);
        touch(b);
    }
    for (const ground of schematic.grounds) {
        touch(ground.at);
    }
    // A wire passing straight through a point joins it from two sides.
    for (const entry of [...ends.values()]) {
        for (const wire of schematic.wires) {
            if (onSegment(entry.point, wire.a, wire.b) && !samePoint(entry.point, wire.a) && !samePoint(entry.point, wire.b)) {
                entry.degree += 2;
            }
        }
    }
    return [...ends.values()].filter((entry) => entry.degree >= 3).map((entry) => entry.point);
}

export interface Bounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

export function schematicBounds(schematic: Schematic): Bounds | null {
    const points: Point[] = [
        ...schematic.parts.flatMap((part) => [...partPins(part)]),
        ...schematic.wires.flatMap((wire) => [wire.a, wire.b]),
        ...schematic.grounds.flatMap((ground) => [ground.at, { x: ground.at.x, y: ground.at.y + GROUND_DROP }]),
    ];
    if (points.length === 0) {
        return null;
    }
    return {
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
    };
}

/** Smallest unused id such as R3 or V2. */
export function nextPartId(parts: readonly Part[], type: PartType): string {
    const prefix = PART_ID_PREFIX[type];
    const used = new Set(parts.map((part) => part.id));
    let n = 1;
    while (used.has(`${prefix}${n}`)) {
        n += 1;
    }
    return `${prefix}${n}`;
}

export function nextElementId(prefix: string, existing: readonly { readonly id: string }[]): string {
    const used = new Set(existing.map((element) => element.id));
    let n = 1;
    while (used.has(`${prefix}${n}`)) {
        n += 1;
    }
    return `${prefix}${n}`;
}

/** The request payload understood by the simulator. */
export function toDto(schematic: Schematic): SchematicDto {
    return {
        components: schematic.parts.map((part) => {
            const [a, b] = partPins(part);
            return { id: part.id, type: part.type, value: part.value, a, b };
        }),
        wires: schematic.wires.map((wire) => ({ a: wire.a, b: wire.b })),
        grounds: schematic.grounds.map((ground) => ground.at),
    };
}
