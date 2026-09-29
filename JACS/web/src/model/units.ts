const SUFFIX_SCALE: ReadonlyMap<string, number> = new Map([
    ['T', 1e12],
    ['G', 1e9],
    ['M', 1e6],
    ['meg', 1e6],
    ['Meg', 1e6],
    ['MEG', 1e6],
    ['k', 1e3],
    ['K', 1e3],
    ['m', 1e-3],
    ['u', 1e-6],
    ['µ', 1e-6],
    ['μ', 1e-6],
    ['n', 1e-9],
    ['p', 1e-12],
    ['f', 1e-15],
]);

// number, optional scale suffix, optional trailing unit that is ignored ("4.7k", "2.2uF", "5 V")
const ENGINEERING = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(meg|Meg|MEG|[TGMkKmuµμnpf])?\s*(?:[Oo]hms?|[VvAaΩ])?\s*$/;

/**
 * Parses "4.7k", "1Meg", "2.2u", "1e3" or "5V". `M` means mega and `m` means milli, as people write
 * resistor values. Returns null when the text is not a finite number.
 */
export function parseEngineering(text: string): number | null {
    const match = ENGINEERING.exec(text);
    if (match === null) {
        return null;
    }
    const [, digits, suffix] = match;
    if (digits === undefined) {
        return null;
    }
    let scale = 1;
    if (suffix !== undefined) {
        const known = SUFFIX_SCALE.get(suffix);
        if (known === undefined) {
            return null;
        }
        scale = known;
    }
    const value = Number(digits) * scale;
    return Number.isFinite(value) ? value : null;
}

const PREFIXES: readonly (readonly [number, string])[] = [
    [1e12, 'T'],
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
    [1e-15, 'f'],
];

/** Formats with three significant digits and an SI prefix, e.g. `formatEngineering(0.003125, 'A')` is "3.13 mA". */
export function formatEngineering(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
        return `? ${unit}`;
    }
    const magnitude = Math.abs(value);
    if (magnitude < 1e-15) {
        return `0 ${unit}`;
    }
    // A value like 999.6 rounds up to "1000" at three digits, so promote it to the next prefix.
    const [scale, prefix] = PREFIXES.find(([s]) => magnitude >= s * 0.9995) ?? PREFIXES[PREFIXES.length - 1] ?? [1, ''];
    const scaled = Number((value / scale).toPrecision(3));
    return `${scaled} ${prefix}${unit}`;
}
