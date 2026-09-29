import type { Editor } from '../editor/editor';
import type { ElementRef, Schematic } from '../model/types';
import { PART_LABEL, PART_UNIT } from '../model/types';
import { formatEngineering, parseEngineering } from '../model/units';
import type { OpResult } from '../sim/protocol';
import { el } from './dom';

/**
 * The panel for editing whatever is selected. Its inputs are built once and updated in place, so a
 * result arriving while the user is typing never steals focus or discards what they typed.
 */
export class Inspector {
    private readonly hint = el('p', { class: 'hint' });
    private readonly form = el('div', { class: 'form' });
    private readonly title = el('h3');
    private readonly valueRow = el('label', { class: 'field' });
    private readonly valueInput = el('input', { attrs: { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' } });
    private readonly unit = el('span', { class: 'unit' });
    private readonly error = el('p', { class: 'field-error', attrs: { role: 'alert' } });
    private readonly rotateButton = el('button', { text: 'Rotate', attrs: { type: 'button' }, title: 'Rotate (R)' });
    private readonly deleteButton = el('button', { text: 'Delete', attrs: { type: 'button' }, title: 'Delete (Del)' });
    private readonly readouts = el('dl', { class: 'readouts' });
    private readonly voltage = el('dd');
    private readonly current = el('dd');
    private readonly power = el('dd');

    private partId: string | null = null;
    private partType: keyof typeof PART_UNIT | null = null;

    constructor(
        root: HTMLElement,
        private readonly editor: Editor,
    ) {
        this.valueRow.append(el('span', { text: 'Value' }), this.valueInput, this.unit);
        this.readouts.append(
            el('dt', { text: 'Voltage a → b' }),
            this.voltage,
            el('dt', { text: 'Current a → b' }),
            this.current,
            el('dt', { text: 'Power' }),
            this.power,
        );
        this.form.append(
            this.title,
            this.valueRow,
            this.error,
            el('div', { class: 'buttons' }, this.rotateButton, this.deleteButton),
            this.readouts,
        );
        root.replaceChildren(el('h2', { text: 'Inspector' }), this.hint, this.form);

        this.rotateButton.addEventListener('click', () => editor.rotateSelection());
        this.deleteButton.addEventListener('click', () => editor.deleteSelection());
        this.valueInput.addEventListener('change', () => this.commit());
        this.valueInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.commit();
                this.valueInput.blur();
            } else if (event.key === 'Escape') {
                this.showValue(true);
                this.valueInput.blur();
            }
        });
    }

    update(schematic: Schematic, selection: ElementRef | null, result: OpResult | null): void {
        const part = selection?.kind === 'part' ? schematic.parts.find((p) => p.id === selection.id) : undefined;
        this.form.hidden = selection === null;
        this.hint.hidden = selection !== null;
        this.hint.textContent = 'Select a part to edit it. Choose a tool from the toolbar, then click the canvas to place.';
        this.partId = part?.id ?? null;
        this.partType = part?.type ?? null;
        this.valueRow.hidden = part === undefined;
        this.rotateButton.hidden = part === undefined;
        this.readouts.hidden = part === undefined;

        if (selection === null) {
            return;
        }
        if (part === undefined) {
            this.title.textContent = selection.kind === 'wire' ? `Wire ${selection.id}` : `Ground ${selection.id}`;
            return;
        }

        this.title.textContent = `${part.id} · ${PART_LABEL[part.type]}`;
        this.unit.textContent = PART_UNIT[part.type];
        this.showValue(false);

        const component = result?.components.find((c) => c.id === part.id);
        const dash = '–';
        this.voltage.textContent = component === undefined ? dash : formatEngineering(component.voltage, 'V');
        this.current.textContent = component === undefined ? dash : formatEngineering(component.current, 'A');
        this.power.textContent =
            component === undefined
                ? dash
                : `${formatEngineering(Math.abs(component.power), 'W')} ${component.power < -1e-15 ? 'delivered' : 'dissipated'}`;
    }

    /** Puts the part's value in the box, unless the user is in the middle of editing it. */
    private showValue(force: boolean): void {
        if (!force && document.activeElement === this.valueInput) {
            return;
        }
        const part = this.currentPart();
        this.valueInput.value = part === undefined ? '' : formatEngineering(part.value, '').replace(/\s+/g, '');
        this.valueInput.classList.remove('invalid');
        this.error.textContent = '';
    }

    private currentPart(): { readonly value: number } | undefined {
        return this.editor.schematic.parts.find((p) => p.id === this.partId);
    }

    private commit(): void {
        if (this.partId === null || this.partType === null) {
            return;
        }
        const value = parseEngineering(this.valueInput.value);
        let problem = '';
        if (value === null) {
            problem = 'Enter a number, such as 4.7k, 2.2u or 1e3.';
        } else if (this.partType === 'resistor' && value <= 0) {
            problem = 'A resistance must be positive.';
        }
        this.valueInput.classList.toggle('invalid', problem !== '');
        this.error.textContent = problem;
        if (value !== null && problem === '') {
            this.editor.setValue(this.partId, value);
        }
    }
}
