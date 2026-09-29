import { addGround, addPart, addWire, removeElement, rotatePart, setPartValue, translateElement } from '../model/edit';
import { axisAligned, hitTest, nextRotation, schematicBounds, snapPoint } from '../model/geometry';
import type { ElementRef, PartType, Point, Rotation, Schematic } from '../model/types';
import type { OpResult } from '../sim/protocol';
import { Emitter } from './emitter';
import type { Ghost, RenderState } from './renderer';
import { Renderer } from './renderer';
import { View } from './view';

export type Tool = 'select' | 'wire' | PartType | 'ground';

export function isTool(value: unknown): value is Tool {
    return value === 'select' || value === 'wire' || value === 'resistor' || value === 'vsource' || value === 'ground';
}

export interface EditorEvents {
    /** The schematic changed: an edit, an undo, or one step of a drag. */
    change: Schematic;
    select: ElementRef | null;
    tool: Tool;
    history: { readonly canUndo: boolean; readonly canRedo: boolean };
}

interface Drag {
    readonly ref: ElementRef;
    readonly start: Point;
    /** The schematic when the drag began; it goes on the undo stack if the drag moved anything. */
    readonly snapshot: Schematic;
    delta: Point;
}

const HISTORY_LIMIT = 200;

function exists(schematic: Schematic, ref: ElementRef): boolean {
    switch (ref.kind) {
        case 'part':
            return schematic.parts.some((part) => part.id === ref.id);
        case 'wire':
            return schematic.wires.some((wire) => wire.id === ref.id);
        case 'ground':
            return schematic.grounds.some((ground) => ground.id === ref.id);
    }
}

function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** The Canvas 2D schematic editor: input handling, tools, selection and undo/redo. */
export class Editor extends Emitter<EditorEvents> {
    readonly view = new View();

    private readonly renderer: Renderer;
    private readonly abort = new AbortController();
    private readonly undoStack: Schematic[] = [];
    private redoStack: Schematic[] = [];

    private document: Schematic;
    private selected: ElementRef | null = null;
    private activeTool: Tool = 'select';
    private rotation: Rotation = 0;
    private hover: Point | null = null;
    private wireStart: Point | null = null;
    private drag: Drag | null = null;
    private pan: { readonly x: number; readonly y: number; readonly offsetX: number; readonly offsetY: number } | null = null;
    private spaceDown = false;
    private result: OpResult | null = null;
    private dirty = true;
    private fitPending = true;
    private frame = 0;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    constructor(
        private readonly canvas: HTMLCanvasElement,
        initial: Schematic,
    ) {
        super();
        this.document = initial;
        this.renderer = new Renderer(canvas, this.view);
        this.attach();
        this.frame = requestAnimationFrame(this.loop);
    }

    get schematic(): Schematic {
        return this.document;
    }

    get selection(): ElementRef | null {
        return this.selected;
    }

    get tool(): Tool {
        return this.activeTool;
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    dispose(): void {
        this.abort.abort();
        cancelAnimationFrame(this.frame);
    }

    setResult(result: OpResult | null): void {
        this.result = result;
        this.dirty = true;
    }

    setTool(tool: Tool): void {
        if (tool === this.activeTool) {
            return;
        }
        this.activeTool = tool;
        this.wireStart = null;
        if (tool !== 'select') {
            this.select(null);
        }
        this.updateCursor();
        this.emit('tool', tool);
        this.dirty = true;
    }

    select(ref: ElementRef | null): void {
        if (ref?.kind === this.selected?.kind && ref?.id === this.selected?.id) {
            return;
        }
        this.selected = ref;
        this.emit('select', ref);
        this.dirty = true;
    }

    /** Replaces the whole document as one undoable edit (import, example, clear). */
    replace(schematic: Schematic): void {
        this.commit(schematic);
        this.fit();
    }

    setValue(id: string, value: number): void {
        if (this.document.parts.find((part) => part.id === id)?.value === value) {
            return;
        }
        this.commit(setPartValue(this.document, id, value));
    }

    rotateSelection(): void {
        if (this.selected?.kind === 'part') {
            this.commit(rotatePart(this.document, this.selected.id));
        }
    }

    deleteSelection(): void {
        if (this.selected !== null) {
            const ref = this.selected;
            this.commit(removeElement(this.document, ref));
        }
    }

    undo(): void {
        const previous = this.undoStack.pop();
        if (previous !== undefined) {
            this.redoStack.push(this.document);
            this.restore(previous);
        }
    }

    redo(): void {
        const next = this.redoStack.pop();
        if (next !== undefined) {
            this.undoStack.push(this.document);
            this.restore(next);
        }
    }

    fit(): void {
        const bounds = schematicBounds(this.document);
        const { width, height } = this.renderer.size;
        if (bounds !== null && width > 0) {
            this.view.fit(bounds, width, height);
        }
        this.dirty = true;
    }

    private restore(schematic: Schematic): void {
        this.document = schematic;
        if (this.selected !== null && !exists(schematic, this.selected)) {
            this.select(null);
        }
        this.emit('change', schematic);
        this.emitHistory();
        this.dirty = true;
    }

    private commit(next: Schematic): void {
        if (next === this.document) {
            return;
        }
        this.pushUndo(this.document);
        this.restore(next);
        if (this.selected !== null && !exists(next, this.selected)) {
            this.select(null);
        }
    }

    private pushUndo(snapshot: Schematic): void {
        this.undoStack.push(snapshot);
        if (this.undoStack.length > HISTORY_LIMIT) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    private emitHistory(): void {
        this.emit('history', { canUndo: this.canUndo, canRedo: this.canRedo });
    }

    // ---- input -----------------------------------------------------------------------------------

    private attach(): void {
        const { signal } = this.abort;
        const canvas = this.canvas;
        canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event), { signal });
        canvas.addEventListener('pointermove', (event) => this.onPointerMove(event), { signal });
        canvas.addEventListener('pointerup', (event) => this.onPointerUp(event), { signal });
        canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event), { signal });
        canvas.addEventListener(
            'pointerleave',
            () => {
                this.hover = null;
                this.dirty = true;
            },
            { signal },
        );
        canvas.addEventListener('dblclick', () => this.finishWire(), { signal });
        canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
        canvas.addEventListener('wheel', (event) => this.onWheel(event), { signal, passive: false });
        window.addEventListener('keydown', (event) => this.onKeyDown(event), { signal });
        window.addEventListener('keyup', (event) => this.onKeyUp(event), { signal });

        new ResizeObserver(() => this.onResize()).observe(canvas);
        this.onResize();
    }

    private onResize(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
        if (this.fitPending && rect.width > 0) {
            this.fitPending = false;
            this.fit();
        }
        this.dirty = true;
    }

    private screenPoint(event: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    private onPointerDown(event: PointerEvent): void {
        const screen = this.screenPoint(event);
        const grid = this.view.toGrid(screen.x, screen.y);
        this.canvas.setPointerCapture(event.pointerId);

        if (event.button === 1 || (event.button === 0 && this.spaceDown)) {
            this.pan = { x: screen.x, y: screen.y, offsetX: this.view.offsetX, offsetY: this.view.offsetY };
            this.canvas.style.cursor = 'grabbing';
            event.preventDefault();
            return;
        }
        if (event.button === 2) {
            if (this.wireStart !== null) {
                this.finishWire();
            } else {
                this.setTool('select');
            }
            return;
        }
        if (event.button !== 0) {
            return;
        }

        const snapped = snapPoint(grid);
        const tool = this.activeTool;
        switch (tool) {
            case 'select': {
                const hit = hitTest(this.document, grid);
                this.select(hit);
                if (hit !== null) {
                    this.drag = { ref: hit, start: snapped, snapshot: this.document, delta: { x: 0, y: 0 } };
                }
                break;
            }
            case 'wire':
                this.placeWirePoint(snapped);
                break;
            case 'ground': {
                const added = addGround(this.document, snapped);
                if (added !== null) {
                    this.commit(added.schematic);
                }
                break;
            }
            case 'resistor':
            case 'vsource': {
                const added = addPart(this.document, tool, snapped, this.rotation);
                this.commit(added.schematic);
                this.select({ kind: 'part', id: added.id });
                break;
            }
        }
        this.dirty = true;
    }

    private placeWirePoint(point: Point): void {
        if (this.wireStart === null) {
            this.wireStart = point;
            return;
        }
        const end = axisAligned(this.wireStart, point);
        const added = addWire(this.document, this.wireStart, end);
        if (added !== null) {
            this.commit(added.schematic);
        }
        // Keep drawing from the end of the segment, so a run of wires is a run of clicks.
        this.wireStart = end;
    }

    private finishWire(): void {
        this.wireStart = null;
        this.dirty = true;
    }

    private onPointerMove(event: PointerEvent): void {
        const screen = this.screenPoint(event);
        const grid = this.view.toGrid(screen.x, screen.y);
        const snapped = snapPoint(grid);

        if (this.pan !== null) {
            this.view.offsetX = this.pan.offsetX + (screen.x - this.pan.x);
            this.view.offsetY = this.pan.offsetY + (screen.y - this.pan.y);
            this.dirty = true;
            return;
        }

        this.hover = snapped;
        if (this.drag !== null) {
            const dx = snapped.x - this.drag.start.x;
            const dy = snapped.y - this.drag.start.y;
            if (dx !== this.drag.delta.x || dy !== this.drag.delta.y) {
                this.drag.delta = { x: dx, y: dy };
                this.document = translateElement(this.drag.snapshot, this.drag.ref, dx, dy);
                this.emit('change', this.document);
            }
        } else if (this.activeTool === 'select') {
            this.canvas.style.cursor = hitTest(this.document, grid) === null ? 'default' : 'move';
        }
        this.dirty = true;
    }

    private onPointerUp(event: PointerEvent): void {
        if (this.canvas.hasPointerCapture(event.pointerId)) {
            this.canvas.releasePointerCapture(event.pointerId);
        }
        if (this.pan !== null) {
            this.pan = null;
            this.updateCursor();
        }
        if (this.drag !== null) {
            const { snapshot, delta } = this.drag;
            this.drag = null;
            if (delta.x !== 0 || delta.y !== 0) {
                this.pushUndo(snapshot);
                this.emitHistory();
            }
        }
    }

    private onWheel(event: WheelEvent): void {
        event.preventDefault();
        const screen = this.screenPoint(event);
        this.view.zoomAt(screen.x, screen.y, Math.exp(-event.deltaY * 0.0015));
        this.dirty = true;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (isTyping(event.target)) {
            return;
        }
        const command = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (command && key === 'z') {
            event.preventDefault();
            if (event.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
            return;
        }
        if (command && key === 'y') {
            event.preventDefault();
            this.redo();
            return;
        }
        if (command || event.altKey) {
            return;
        }
        switch (key) {
            case ' ':
                this.spaceDown = true;
                event.preventDefault();
                break;
            case 'delete':
            case 'backspace':
                this.deleteSelection();
                break;
            case 'r':
                // While placing, R turns the part about to be placed, not the one just placed.
                if (this.activeTool === 'select' && this.selected?.kind === 'part') {
                    this.rotateSelection();
                } else {
                    this.rotation = nextRotation(this.rotation);
                    this.dirty = true;
                }
                break;
            case 'escape':
                if (this.wireStart !== null) {
                    this.finishWire();
                } else if (this.activeTool !== 'select') {
                    this.setTool('select');
                } else {
                    this.select(null);
                }
                break;
            case '1':
                this.setTool('select');
                break;
            case '2':
                this.setTool('wire');
                break;
            case '3':
                this.setTool('resistor');
                break;
            case '4':
                this.setTool('vsource');
                break;
            case '5':
                this.setTool('ground');
                break;
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        if (event.key === ' ') {
            this.spaceDown = false;
        }
    }

    private updateCursor(): void {
        this.canvas.style.cursor = this.activeTool === 'select' ? 'default' : 'crosshair';
    }

    // ---- drawing ---------------------------------------------------------------------------------

    private renderState(seconds: number): RenderState {
        const hover = this.hover;
        const tool = this.activeTool;
        let ghost: Ghost | null = null;
        if (hover !== null) {
            if (tool === 'resistor' || tool === 'vsource') {
                ghost = { kind: 'part', type: tool, origin: hover, rotation: this.rotation };
            } else if (tool === 'ground') {
                ghost = { kind: 'ground', at: hover };
            }
        }
        const wirePreview =
            tool === 'wire' && this.wireStart !== null && hover !== null
                ? { a: this.wireStart, b: axisAligned(this.wireStart, hover) }
                : null;
        return {
            schematic: this.document,
            selection: this.selected,
            ghost,
            wirePreview,
            result: this.result,
            seconds,
        };
    }

    private readonly loop = (now: number): void => {
        const state = this.renderState(this.reducedMotion.matches ? 0 : now / 1000);
        if (this.dirty || (!this.reducedMotion.matches && this.renderer.isAnimating(state))) {
            this.dirty = false;
            this.renderer.draw(state);
        }
        this.frame = requestAnimationFrame(this.loop);
    };
}
