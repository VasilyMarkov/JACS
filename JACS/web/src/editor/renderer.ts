import type { Rgb } from '../model/colors';
import { rgbCss, voltageColor } from '../model/colors';
import { GROUND_DROP, PART_LENGTH, direction, junctionPoints, partCenter, partPins } from '../model/geometry';
import type { ElementRef, Part, PartType, Point, Rotation, Schematic } from '../model/types';
import { PART_UNIT } from '../model/types';
import { formatEngineering } from '../model/units';
import type { ComponentResult, OpResult } from '../sim/protocol';
import type { View } from './view';

const THEME = {
    background: '#12151c',
    grid: 'rgba(255, 255, 255, 0.11)',
    wire: '#7d8ba1',
    part: '#dfe6f0',
    text: '#dfe6f0',
    dim: '#8b96a8',
    accent: '#5ec2ff',
    flow: '#ffd166',
    badge: 'rgba(18, 21, 28, 0.9)',
} as const;

/** Currents below this are numerical noise and are drawn as no flow. */
const FLOW_THRESHOLD = 1e-12;

export type Ghost =
    | { readonly kind: 'part'; readonly type: PartType; readonly origin: Point; readonly rotation: Rotation }
    | { readonly kind: 'ground'; readonly at: Point };

export interface RenderState {
    readonly schematic: Schematic;
    readonly selection: ElementRef | null;
    readonly ghost: Ghost | null;
    readonly wirePreview: { readonly a: Point; readonly b: Point } | null;
    readonly result: OpResult | null;
    readonly seconds: number;
}

/** A result only applies while it still lines up with the schematic it was computed from. */
function matchingResult(state: RenderState): OpResult | null {
    const { result, schematic } = state;
    if (result === null || result.wires.length !== schematic.wires.length) {
        return null;
    }
    if (result.components.length !== schematic.parts.length) {
        return null;
    }
    return result.components.every((c, i) => c.id === schematic.parts[i]?.id) ? result : null;
}

function flowing(component: ComponentResult | undefined): component is ComponentResult {
    return component !== undefined && Math.abs(component.current) > FLOW_THRESHOLD;
}

export class Renderer {
    private readonly ctx: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private dpr = 1;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly view: View,
    ) {
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            throw new Error('2D canvas is not available');
        }
        this.ctx = ctx;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.canvas.width = Math.max(1, Math.round(width * dpr));
        this.canvas.height = Math.max(1, Math.round(height * dpr));
    }

    get size(): { readonly width: number; readonly height: number } {
        return { width: this.width, height: this.height };
    }

    /** True while something on screen moves, so the caller keeps redrawing. */
    isAnimating(state: RenderState): boolean {
        const result = matchingResult(state);
        return result !== null && result.components.some((c) => flowing(c));
    }

    draw(state: RenderState): void {
        const { ctx } = this;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = THEME.background;
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const result = matchingResult(state);
        const maxAbs = result === null ? 0 : Math.max(0, ...result.nodeVoltages.map((v) => Math.abs(v)).filter(Number.isFinite));
        const nodeColor = (node: number): Rgb | null => {
            if (result === null || node < 0) {
                return null;
            }
            return voltageColor(result.nodeVoltages[node] ?? 0, maxAbs);
        };

        this.drawGrid();
        this.drawSelection(state);
        this.drawWires(state, result, nodeColor);
        for (const ground of state.schematic.grounds) {
            this.drawGround(ground.at, 1);
        }
        state.schematic.parts.forEach((part, i) => {
            const component = result?.components[i];
            this.drawPart(part, component === undefined ? null : nodeColor(component.nodeA), component === undefined ? null : nodeColor(component.nodeB), 1);
        });
        this.drawJunctions(state.schematic);
        if (result !== null) {
            this.drawFlow(state.schematic, result, state.seconds);
            this.drawLabels(state.schematic, result);
            this.drawBadges(state.schematic, result, nodeColor);
        } else {
            this.drawLabels(state.schematic, null);
        }
        this.drawOverlays(state);
    }

    private drawGrid(): void {
        const { ctx, view } = this;
        const step = view.scale < 14 ? 2 : 1;
        const topLeft = view.toGrid(0, 0);
        const bottomRight = view.toGrid(this.width, this.height);
        const x0 = Math.floor(topLeft.x / step) * step;
        const y0 = Math.floor(topLeft.y / step) * step;
        ctx.fillStyle = THEME.grid;
        for (let gx = x0; gx <= bottomRight.x; gx += step) {
            for (let gy = y0; gy <= bottomRight.y; gy += step) {
                const p = view.toScreen({ x: gx, y: gy });
                ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
            }
        }
    }

    private drawSelection(state: RenderState): void {
        const { ctx, view } = this;
        const { selection, schematic } = state;
        if (selection === null) {
            return;
        }
        ctx.strokeStyle = 'rgba(94, 194, 255, 0.28)';
        ctx.fillStyle = 'rgba(94, 194, 255, 0.28)';
        ctx.lineWidth = 16;
        const line = (a: Point, b: Point): void => {
            const from = view.toScreen(a);
            const to = view.toScreen(b);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        };
        if (selection.kind === 'part') {
            const part = schematic.parts.find((p) => p.id === selection.id);
            if (part !== undefined) {
                line(...partPins(part));
            }
        } else if (selection.kind === 'wire') {
            const wire = schematic.wires.find((w) => w.id === selection.id);
            if (wire !== undefined) {
                line(wire.a, wire.b);
            }
        } else {
            const ground = schematic.grounds.find((g) => g.id === selection.id);
            if (ground !== undefined) {
                line(ground.at, { x: ground.at.x, y: ground.at.y + GROUND_DROP });
            }
        }
    }

    private drawWires(state: RenderState, result: OpResult | null, nodeColor: (node: number) => Rgb | null): void {
        const { ctx, view } = this;
        ctx.lineWidth = 2.5;
        state.schematic.wires.forEach((wire, i) => {
            const color = result === null ? null : nodeColor(result.wires[i] ?? -1);
            ctx.strokeStyle = color === null ? THEME.wire : rgbCss(color);
            const a = view.toScreen(wire.a);
            const b = view.toScreen(wire.b);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });
    }

    private drawJunctions(schematic: Schematic): void {
        const { ctx, view } = this;
        ctx.fillStyle = THEME.part;
        for (const point of junctionPoints(schematic)) {
            const p = view.toScreen(point);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private drawGround(at: Point, alpha: number): void {
        const { ctx, view } = this;
        const s = view.scale;
        const p = view.toScreen(at);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = THEME.part;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + 0.7 * s);
        for (const [drop, half] of [[0.7, 0.6], [1.1, 0.4], [1.5, 0.2]] as const) {
            ctx.moveTo(p.x - half * s, p.y + drop * s);
            ctx.lineTo(p.x + half * s, p.y + drop * s);
        }
        ctx.stroke();
        ctx.restore();
    }

    private drawPart(part: Part, colorA: Rgb | null, colorB: Rgb | null, alpha: number): void {
        const { ctx, view } = this;
        const s = view.scale;
        const [pinA, pinB] = partPins(part);
        const origin = view.toScreen(pinA);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(origin.x, origin.y);
        ctx.rotate((part.rotation * Math.PI) / 180);
        if (colorA !== null && colorB !== null) {
            const gradient = ctx.createLinearGradient(0, 0, PART_LENGTH * s, 0);
            gradient.addColorStop(0, rgbCss(colorA));
            gradient.addColorStop(1, rgbCss(colorB));
            ctx.strokeStyle = gradient;
        } else {
            ctx.strokeStyle = THEME.part;
        }
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (part.type === 'resistor') {
            ctx.moveTo(0, 0);
            ctx.lineTo(s, 0);
            const teeth = 6;
            for (let k = 0; k < teeth; k += 1) {
                ctx.lineTo((1 + (k + 0.5) * (2 / teeth)) * s, (k % 2 === 0 ? -1 : 1) * 0.32 * s);
            }
            ctx.lineTo(3 * s, 0);
            ctx.lineTo(4 * s, 0);
        } else {
            ctx.moveTo(0, 0);
            ctx.lineTo(1.2 * s, 0);
            ctx.moveTo(2.8 * s, 0);
            ctx.lineTo(4 * s, 0);
            ctx.moveTo(2.8 * s, 0);
            ctx.arc(2 * s, 0, 0.8 * s, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();

        if (part.type === 'vsource') {
            // Signs stay upright whatever the rotation, so they are drawn in screen space.
            const center = view.toScreen(partCenter(part));
            const d = direction(part.rotation);
            const sign = (offset: number, plus: boolean): void => {
                const x = center.x + d.x * offset * s;
                const y = center.y + d.y * offset * s;
                const arm = 0.16 * s;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = THEME.part;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(x - arm, y);
                ctx.lineTo(x + arm, y);
                if (plus) {
                    ctx.moveTo(x, y - arm);
                    ctx.lineTo(x, y + arm);
                }
                ctx.stroke();
                ctx.restore();
            };
            sign(-0.42, true);
            sign(0.42, false);
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        for (const [pin, color] of [[pinA, colorA], [pinB, colorB]] as const) {
            const p = view.toScreen(pin);
            ctx.fillStyle = color === null ? THEME.part : rgbCss(color);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    private font(weight: number): string {
        return `${weight} ${Math.max(10, Math.min(14, this.view.scale * 0.46))}px ui-sans-serif, system-ui, sans-serif`;
    }

    private text(value: string, x: number, y: number, align: CanvasTextAlign, color: string, weight = 500): void {
        const { ctx } = this;
        ctx.font = this.font(weight);
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(value, x, y);
    }

    private drawLabels(schematic: Schematic, result: OpResult | null): void {
        const s = this.view.scale;
        schematic.parts.forEach((part, i) => {
            const center = this.view.toScreen(partCenter(part));
            const horizontal = part.rotation === 0 || part.rotation === 180;
            const name = `${part.id}  ${formatEngineering(part.value, PART_UNIT[part.type])}`;
            const component = result?.components[i];
            const current = component === undefined ? null : `${formatEngineering(Math.abs(component.current), 'A')}`;
            if (horizontal) {
                this.text(name, center.x, center.y - 1.15 * s, 'center', THEME.text, 600);
                if (current !== null) {
                    this.text(current, center.x, center.y + 1.15 * s, 'center', THEME.flow);
                }
            } else {
                this.text(name, center.x + 1.1 * s, center.y, 'left', THEME.text, 600);
                if (current !== null) {
                    this.text(current, center.x - 1.1 * s, center.y, 'right', THEME.flow);
                }
            }
        });
    }

    /** One voltage badge per node, at the first part pin that touches it. */
    private drawBadges(schematic: Schematic, result: OpResult, nodeColor: (node: number) => Rgb | null): void {
        const { ctx, view } = this;
        const labelled = new Set<number>([0]);
        schematic.parts.forEach((part, i) => {
            const component = result.components[i];
            if (component === undefined) {
                return;
            }
            const center = partCenter(part);
            const pins = partPins(part);
            const nodes = [component.nodeA, component.nodeB] as const;
            pins.forEach((pin, k) => {
                const node = nodes[k];
                if (node === undefined || labelled.has(node)) {
                    return;
                }
                labelled.add(node);
                const outward = { x: Math.sign(pin.x - center.x), y: Math.sign(pin.y - center.y) };
                const at = view.toScreen({ x: pin.x + outward.x * 0.2, y: pin.y + outward.y * 0.2 });
                const label = `N${node}  ${formatEngineering(result.nodeVoltages[node] ?? Number.NaN, 'V')}`;
                ctx.font = this.font(600);
                const width = ctx.measureText(label).width + 14;
                // Above the pin for a horizontal part, beside it for a vertical one, so the badge
                // stays off the wire that leaves the pin.
                const beside = outward.x === 0;
                const x = beside ? at.x + 10 : at.x - width / 2;
                const y = beside ? at.y - 10 : at.y - 30;
                const color = nodeColor(node);
                ctx.fillStyle = THEME.badge;
                ctx.strokeStyle = color === null ? THEME.dim : rgbCss(color);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(x, y, width, 20, 6);
                ctx.fill();
                ctx.stroke();
                this.text(label, x + width / 2, y + 10.5, 'center', THEME.text, 600);
            });
        });
    }

    /** Dots drifting from terminal a towards b for a positive current, faster for larger currents. */
    private drawFlow(schematic: Schematic, result: OpResult, seconds: number): void {
        const { ctx, view } = this;
        const dots = 5;
        ctx.fillStyle = THEME.flow;
        schematic.parts.forEach((part, i) => {
            const component = result.components[i];
            if (!flowing(component)) {
                return;
            }
            const [a, b] = partPins(part);
            const speed = 0.4 + 1.6 * Math.min(1, Math.log10(1 + Math.abs(component.current) * 1000) / 2);
            const direct = component.current >= 0 ? 1 : -1;
            for (let k = 0; k < dots; k += 1) {
                const along = (((seconds * speed * direct) / PART_LENGTH + k / dots) % 1 + 1) % 1;
                const p = view.toScreen({ x: a.x + (b.x - a.x) * along, y: a.y + (b.y - a.y) * along });
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.8, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    private drawOverlays(state: RenderState): void {
        const { ctx, view } = this;
        const { ghost, wirePreview } = state;
        if (ghost?.kind === 'part') {
            this.drawPart({ id: '', type: ghost.type, value: 0, origin: ghost.origin, rotation: ghost.rotation }, null, null, 0.5);
        } else if (ghost?.kind === 'ground') {
            this.drawGround(ghost.at, 0.5);
        }
        if (wirePreview !== null) {
            const a = view.toScreen(wirePreview.a);
            const b = view.toScreen(wirePreview.b);
            ctx.strokeStyle = THEME.accent;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = THEME.accent;
            ctx.beginPath();
            ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
