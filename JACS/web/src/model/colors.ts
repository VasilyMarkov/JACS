/** An sRGB colour with each channel in 0..255. */
export type Rgb = readonly [number, number, number];

const LOW: Rgb = [77, 163, 255];
const ZERO: Rgb = [150, 160, 175];
const HIGH: Rgb = [255, 122, 69];

function mix(from: Rgb, to: Rgb, t: number): Rgb {
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** Diverging map anchored at 0 V: blue below, grey at zero, orange above. `maxAbs` is the full-scale voltage. */
export function voltageColor(voltage: number, maxAbs: number): Rgb {
    if (!(maxAbs > 0) || !Number.isFinite(voltage)) {
        return ZERO;
    }
    const t = Math.max(-1, Math.min(1, voltage / maxAbs));
    return t >= 0 ? mix(ZERO, HIGH, t) : mix(ZERO, LOW, -t);
}

export function rgbCss(color: Rgb, alpha = 1): string {
    const [r, g, b] = color;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
