import { describe, expect, it } from 'vitest';
import { EXAMPLE_SCHEMATIC } from '../src/model/example';
import { toDto } from '../src/model/geometry';
import type { Schematic } from '../src/model/types';
import { EMPTY_SCHEMATIC } from '../src/model/types';
import type { Engine } from '../src/sim/engine';
import { makeEngine } from '../src/sim/engine';
import { parseOpResponse } from '../src/sim/protocol';
// Needs `npm run wasm` first. This is the real module, loaded the same way the worker loads it.
import createJacsModule from '../src/wasm/jacs.js';

async function engine(): Promise<Engine> {
    return makeEngine(await createJacsModule());
}

describe('the WebAssembly simulator', () => {
    it('solves the example divider', async () => {
        const outcome = (await engine()).operatingPoint(toDto(EXAMPLE_SCHEMATIC));
        if (!outcome.ok) {
            throw new Error(outcome.error);
        }
        const { nodeVoltages, components, wires } = outcome.result;
        expect(nodeVoltages).toHaveLength(4);
        expect(nodeVoltages[0]).toBe(0);
        expect(nodeVoltages[1]).toBeCloseTo(5);
        expect(nodeVoltages[2]).toBeCloseTo(1.875);
        expect(nodeVoltages[3]).toBeCloseTo(0.3125);

        const current = (id: string): number => components.find((c) => c.id === id)?.current ?? Number.NaN;
        expect(current('R1')).toBeCloseTo(0.003125);
        expect(current('V1')).toBeCloseTo(-0.003125); // the source delivers power
        const power = components.reduce((sum, c) => sum + c.power, 0);
        expect(power).toBeCloseTo(0, 12); // energy balance

        // w1..w3 are on the supply nodes, w4/w5 are the ground rail.
        expect(wires).toEqual([1, 1, 2, 0, 0]);
    });

    it('reports circuit problems as errors, not exceptions', async () => {
        const sim = await engine();
        const noGround: Schematic = { ...EXAMPLE_SCHEMATIC, grounds: [] };
        expect(sim.operatingPoint(toDto(noGround))).toEqual({ ok: false, error: 'no ground: add a ground symbol' });

        const zero: Schematic = {
            ...EXAMPLE_SCHEMATIC,
            parts: EXAMPLE_SCHEMATIC.parts.map((p) => (p.id === 'R1' ? { ...p, value: 0 } : p)),
        };
        expect(sim.operatingPoint(toDto(zero))).toEqual({ ok: false, error: 'R1: resistance must be positive' });

        // An island of parts with no path to ground has no defined voltage.
        const island: Schematic = {
            ...EXAMPLE_SCHEMATIC,
            parts: [
                ...EXAMPLE_SCHEMATIC.parts,
                { id: 'R4', type: 'resistor', value: 10, origin: { x: 20, y: 0 }, rotation: 0 },
            ],
        };
        const singular = sim.operatingPoint(toDto(island));
        expect(singular.ok).toBe(false);
        expect(!singular.ok && singular.error).toMatch(/singular/);
    });

    it('treats a broken loop as an open circuit, not an error', async () => {
        const open: Schematic = {
            ...EXAMPLE_SCHEMATIC,
            wires: EXAMPLE_SCHEMATIC.wires.filter((w) => w.id !== 'w4'),
        };
        const outcome = (await engine()).operatingPoint(toDto(open));
        if (!outcome.ok) {
            throw new Error(outcome.error);
        }
        for (const component of outcome.result.components) {
            expect(component.current).toBeCloseTo(0, 12);
        }
    });

    it('returns an empty result for an empty schematic', async () => {
        const outcome = (await engine()).operatingPoint(toDto(EMPTY_SCHEMATIC));
        expect(outcome).toEqual({ ok: true, result: { nodeVoltages: [0], components: [], wires: [] } });
    });

    it('rejects malformed requests without throwing', async () => {
        const runtime = await createJacsModule();
        for (const request of ['{not json', '{}', '{"analysis":"nope","schematic":{"components":[],"wires":[],"grounds":[]}}']) {
            const outcome = parseOpResponse(runtime.run(request));
            expect(outcome.ok, request).toBe(false);
        }
    });
});

describe('response validation', () => {
    it('refuses responses of the wrong shape', () => {
        expect(() => parseOpResponse('nope')).toThrow('not JSON');
        expect(() => parseOpResponse('{"ok":true,"analysis":"other"}')).toThrow('expected a "op" response');
        expect(() => parseOpResponse('{"ok":true,"analysis":"op","nodeVoltages":["x"],"components":[],"wires":[]}')).toThrow(
            'nodeVoltages',
        );
    });

    it('reads null as NaN', () => {
        const outcome = parseOpResponse('{"ok":true,"analysis":"op","nodeVoltages":[0,null],"components":[],"wires":[]}');
        expect(outcome.ok && outcome.result.nodeVoltages[1]).toBeNaN();
    });
});
