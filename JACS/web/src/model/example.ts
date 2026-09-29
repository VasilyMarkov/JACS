import type { Schematic } from './types';

/** A 5 V source across three series resistors, with a ground rail joined by a T-junction. */
export const EXAMPLE_SCHEMATIC: Schematic = {
    parts: [
        { id: 'V1', type: 'vsource', value: 5, origin: { x: 0, y: 2 }, rotation: 90 },
        { id: 'R1', type: 'resistor', value: 1000, origin: { x: 2, y: 0 }, rotation: 0 },
        { id: 'R2', type: 'resistor', value: 500, origin: { x: 8, y: 0 }, rotation: 90 },
        { id: 'R3', type: 'resistor', value: 100, origin: { x: 8, y: 4 }, rotation: 90 },
    ],
    wires: [
        { id: 'w1', a: { x: 0, y: 2 }, b: { x: 0, y: 0 } },
        { id: 'w2', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } },
        { id: 'w3', a: { x: 6, y: 0 }, b: { x: 8, y: 0 } },
        { id: 'w4', a: { x: 0, y: 6 }, b: { x: 0, y: 8 } },
        { id: 'w5', a: { x: 0, y: 8 }, b: { x: 8, y: 8 } },
    ],
    grounds: [{ id: 'g1', at: { x: 4, y: 8 } }],
};
