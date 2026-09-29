import type { Editor } from '../editor/editor';
import type { Schematic } from '../model/types';
import { formatEngineering } from '../model/units';
import type { OpResult } from '../sim/protocol';
import { el } from './dom';

/** The operating-point tables: node voltages, then every component's voltage, current and power. */
export class ResultsPanel {
    constructor(
        private readonly root: HTMLElement,
        private readonly editor: Editor,
    ) {
        this.showMessage('Waiting for the simulator…');
    }

    showResult(schematic: Schematic, result: OpResult): void {
        const nodes = el('div', { class: 'chips' });
        result.nodeVoltages.forEach((volts, node) => {
            nodes.append(
                el('span', { class: 'chip', title: node === 0 ? 'Ground' : `Node ${node}` }, el('b', { text: node === 0 ? 'GND' : `N${node}` }), ` ${formatEngineering(volts, 'V')}`),
            );
        });

        const body = el('tbody');
        for (const component of result.components) {
            const row = el(
                'tr',
                { attrs: { tabindex: '0' }, title: `Select ${component.id}` },
                el('th', { text: component.id, attrs: { scope: 'row' } }),
                el('td', { text: formatEngineering(component.voltage, 'V') }),
                el('td', { text: formatEngineering(component.current, 'A') }),
                el('td', { text: formatEngineering(component.power, 'W') }),
            );
            const select = (): void => {
                if (schematic.parts.some((part) => part.id === component.id)) {
                    this.editor.select({ kind: 'part', id: component.id });
                }
            };
            row.addEventListener('click', select);
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select();
                }
            });
            body.append(row);
        }

        const table = el(
            'table',
            {},
            el('thead', {}, el('tr', {}, el('th', { text: 'Part' }), el('th', { text: 'Voltage' }), el('th', { text: 'Current' }), el('th', { text: 'Power' }))),
            body,
        );
        this.root.replaceChildren(el('h2', { text: 'Operating point' }), nodes, result.components.length === 0 ? el('p', { class: 'hint', text: 'No parts yet.' }) : table);
    }

    showMessage(message: string): void {
        this.root.replaceChildren(el('h2', { text: 'Operating point' }), el('p', { class: 'hint', text: message }));
    }

    showError(message: string): void {
        this.root.replaceChildren(el('h2', { text: 'Operating point' }), el('p', { class: 'error', text: message }));
    }
}
