import { describe, expect, it } from 'vitest';
import { EXAMPLE_SCHEMATIC } from '../src/model/example';
import { addGround, addPart, addWire, removeElement, translateElement } from '../src/model/edit';
import {
    axisAligned,
    hitTest,
    junctionPoints,
    partPins,
    rotatedPart,
    schematicBounds,
    snap,
    toDto,
} from '../src/model/geometry';
import type { Part, Schematic } from '../src/model/types';
import { EMPTY_SCHEMATIC } from '../src/model/types';

const resistor: Part = { id: 'R1', type: 'resistor', value: 1000, origin: { x: 2, y: 3 }, rotation: 0 };

describe('part geometry', () => {
    it('places pin b one part length along the rotation', () => {
        expect(partPins(resistor)[1]).toEqual({ x: 6, y: 3 });
        expect(partPins({ ...resistor, rotation: 90 })[1]).toEqual({ x: 2, y: 7 });
        expect(partPins({ ...resistor, rotation: 180 })[1]).toEqual({ x: -2, y: 3 });
        expect(partPins({ ...resistor, rotation: 270 })[1]).toEqual({ x: 2, y: -1 });
    });

    it('rotates about its centre and stays on the grid', () => {
        let part = resistor;
        const center = { x: 4, y: 3 };
        for (let turn = 0; turn < 4; turn += 1) {
            part = rotatedPart(part);
            const [a, b] = partPins(part);
            expect({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }).toEqual(center);
            expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
        }
        expect(part).toEqual(resistor);
    });

    it('snaps without producing negative zero', () => {
        expect(Object.is(snap(-0.2), 0)).toBe(true);
        expect(snap(2.5)).toBe(3);
    });

    it('projects wires onto the dominant axis', () => {
        expect(axisAligned({ x: 0, y: 0 }, { x: 5, y: 2 })).toEqual({ x: 5, y: 0 });
        expect(axisAligned({ x: 0, y: 0 }, { x: 1, y: -4 })).toEqual({ x: 0, y: -4 });
    });
});

describe('hit testing', () => {
    it('finds parts, wires and grounds, and misses empty space', () => {
        expect(hitTest(EXAMPLE_SCHEMATIC, { x: 4, y: 0.1 })).toEqual({ kind: 'part', id: 'R1' });
        expect(hitTest(EXAMPLE_SCHEMATIC, { x: 4, y: 8.2 })?.kind).toBe('ground');
        expect(hitTest(EXAMPLE_SCHEMATIC, { x: 1, y: 8 })).toEqual({ kind: 'wire', id: 'w5' });
        expect(hitTest(EXAMPLE_SCHEMATIC, { x: 4, y: 4 })).toBeNull();
    });
});

describe('junctions', () => {
    it('marks a T-junction but not a plain corner or a crossing', () => {
        expect(junctionPoints(EXAMPLE_SCHEMATIC)).toEqual([{ x: 4, y: 8 }]);

        const crossing: Schematic = {
            ...EMPTY_SCHEMATIC,
            wires: [
                { id: 'w1', a: { x: 0, y: 2 }, b: { x: 4, y: 2 } },
                { id: 'w2', a: { x: 2, y: 0 }, b: { x: 2, y: 4 } },
            ],
        };
        expect(junctionPoints(crossing)).toEqual([]);
    });
});

describe('edits', () => {
    it('numbers new parts with the smallest free id', () => {
        const first = addPart(EMPTY_SCHEMATIC, 'resistor', { x: 0, y: 0 }, 0);
        const second = addPart(first.schematic, 'resistor', { x: 0, y: 2 }, 0);
        expect([first.id, second.id]).toEqual(['R1', 'R2']);
        const withoutFirst = removeElement(second.schematic, { kind: 'part', id: 'R1' });
        expect(addPart(withoutFirst, 'resistor', { x: 0, y: 4 }, 0).id).toBe('R1');
    });

    it('never mutates its input', () => {
        const before = JSON.stringify(EXAMPLE_SCHEMATIC);
        translateElement(EXAMPLE_SCHEMATIC, { kind: 'part', id: 'R1' }, 1, 1);
        removeElement(EXAMPLE_SCHEMATIC, { kind: 'wire', id: 'w1' });
        expect(JSON.stringify(EXAMPLE_SCHEMATIC)).toBe(before);
    });

    it('ignores zero-length and duplicate wires and duplicate grounds', () => {
        expect(addWire(EMPTY_SCHEMATIC, { x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
        const wire = addWire(EMPTY_SCHEMATIC, { x: 0, y: 0 }, { x: 3, y: 0 });
        expect(wire).not.toBeNull();
        expect(addWire(wire?.schematic ?? EMPTY_SCHEMATIC, { x: 3, y: 0 }, { x: 0, y: 0 })).toBeNull();
        const ground = addGround(EMPTY_SCHEMATIC, { x: 0, y: 0 });
        expect(addGround(ground?.schematic ?? EMPTY_SCHEMATIC, { x: 0, y: 0 })).toBeNull();
    });
});

describe('export', () => {
    it('describes every part by its two pins', () => {
        const dto = toDto(EXAMPLE_SCHEMATIC);
        expect(dto.components).toHaveLength(4);
        expect(dto.components[0]).toEqual({
            id: 'V1',
            type: 'vsource',
            value: 5,
            a: { x: 0, y: 2 },
            b: { x: 0, y: 6 },
        });
        expect(dto.grounds).toEqual([{ x: 4, y: 8 }]);
    });

    it('computes bounds including the ground symbol', () => {
        expect(schematicBounds(EMPTY_SCHEMATIC)).toBeNull();
        expect(schematicBounds(EXAMPLE_SCHEMATIC)).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 9.5 });
    });
});
