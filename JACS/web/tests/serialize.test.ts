import { describe, expect, it } from 'vitest';
import { EXAMPLE_SCHEMATIC } from '../src/model/example';
import { parseSchematic, serializeSchematic } from '../src/model/serialize';
import { EMPTY_SCHEMATIC } from '../src/model/types';

describe('schematic files', () => {
    it('round-trips a schematic', () => {
        expect(parseSchematic(serializeSchematic(EXAMPLE_SCHEMATIC))).toEqual(EXAMPLE_SCHEMATIC);
        expect(parseSchematic(serializeSchematic(EMPTY_SCHEMATIC))).toEqual(EMPTY_SCHEMATIC);
    });

    it('rejects anything that is not a valid schematic', () => {
        const valid = JSON.parse(serializeSchematic(EXAMPLE_SCHEMATIC)) as Record<string, unknown>;
        const bad: unknown[] = [
            'not json',
            {},
            { ...valid, format: 'other' },
            { ...valid, version: 2 },
            { ...valid, parts: 'nope' },
            { ...valid, parts: [{ id: 'R1', type: 'capacitor', value: 1, origin: { x: 0, y: 0 }, rotation: 0 }] },
            { ...valid, parts: [{ id: 'R1', type: 'resistor', value: 1, origin: { x: 0.5, y: 0 }, rotation: 0 }] },
            { ...valid, parts: [{ id: 'R1', type: 'resistor', value: 1, origin: { x: 0, y: 0 }, rotation: 45 }] },
            { ...valid, parts: [{ id: 'R1', type: 'resistor', value: null, origin: { x: 0, y: 0 }, rotation: 0 }] },
            { ...valid, wires: [{ id: 'w1', a: { x: 0, y: 0 } }] },
        ];
        for (const candidate of bad) {
            const text = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
            expect(parseSchematic(text), text).toBeNull();
        }
    });

    it('rejects duplicate ids, which would make edits ambiguous', () => {
        const doubled = { ...EXAMPLE_SCHEMATIC, parts: [...EXAMPLE_SCHEMATIC.parts, ...EXAMPLE_SCHEMATIC.parts] };
        expect(parseSchematic(serializeSchematic(doubled))).toBeNull();
    });
});
