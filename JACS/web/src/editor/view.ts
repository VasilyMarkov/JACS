import type { Bounds } from '../model/geometry';
import type { Point } from '../model/types';

const MIN_SCALE = 8;
const MAX_SCALE = 80;
/** Grid units of empty space kept around the schematic for labels. */
const LABEL_ROOM = 2;

/** Maps between grid coordinates and canvas pixels (CSS pixels, before device scaling). */
export class View {
    /** Pixels per grid unit. */
    scale = 28;
    offsetX = 60;
    offsetY = 60;

    toScreen(p: Point): Point {
        return { x: this.offsetX + p.x * this.scale, y: this.offsetY + p.y * this.scale };
    }

    toGrid(screenX: number, screenY: number): Point {
        return { x: (screenX - this.offsetX) / this.scale, y: (screenY - this.offsetY) / this.scale };
    }

    panBy(dx: number, dy: number): void {
        this.offsetX += dx;
        this.offsetY += dy;
    }

    /** Zooms by `factor` keeping the grid point under the cursor fixed. */
    zoomAt(screenX: number, screenY: number, factor: number): void {
        const anchor = this.toGrid(screenX, screenY);
        this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
        this.offsetX = screenX - anchor.x * this.scale;
        this.offsetY = screenY - anchor.y * this.scale;
    }

    /**
     * Centres `bounds` in a viewport of the given size. Part labels and voltage badges reach
     * about a grid unit and a half past the geometry, and the help pill covers the top edge, so
     * `LABEL_ROOM` units are left empty on every side.
     */
    fit(bounds: Bounds, width: number, height: number): void {
        const pad = LABEL_ROOM;
        const margin = 20;
        const spanX = Math.max(bounds.maxX - bounds.minX, 1) + 2 * pad;
        const spanY = Math.max(bounds.maxY - bounds.minY, 1) + 2 * pad;
        const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
        this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
        this.offsetX = (width - spanX * this.scale) / 2 - (bounds.minX - pad) * this.scale;
        this.offsetY = (height - spanY * this.scale) / 2 - (bounds.minY - pad) * this.scale;
    }
}
