import { Editor, isTool } from './editor/editor';
import { EXAMPLE_SCHEMATIC } from './model/example';
import { toDto } from './model/geometry';
import { parseSchematic, serializeSchematic } from './model/serialize';
import type { Schematic } from './model/types';
import { EMPTY_SCHEMATIC } from './model/types';
import { SimClient } from './sim/client';
import type { OpResult } from './sim/protocol';
import { el, requireElement, requireElements } from './ui/dom';
import { Inspector } from './ui/inspector';
import { ResultsPanel } from './ui/results';

const STORAGE_KEY = 'jacs.schematic.v1';
const REFRESH_DELAY_MS = 30;
const SAVE_DELAY_MS = 400;

type Action = 'undo' | 'redo' | 'fit' | 'example' | 'clear' | 'export' | 'import';

function isAction(value: unknown): value is Action {
    return (
        value === 'undo' || value === 'redo' || value === 'fit' || value === 'example' ||
        value === 'clear' || value === 'export' || value === 'import'
    );
}

function loadSaved(): Schematic | null {
    try {
        const text = localStorage.getItem(STORAGE_KEY);
        return text === null ? null : parseSchematic(text);
    } catch {
        return null; // storage can be blocked; the editor works without it
    }
}

function save(schematic: Schematic): void {
    try {
        localStorage.setItem(STORAGE_KEY, serializeSchematic(schematic));
    } catch {
        // storage full or blocked: nothing to do, the document is still in memory
    }
}

function describe(schematic: Schematic, result: OpResult): string {
    const nodes = result.nodeVoltages.length - 1;
    return `Solved · ${nodes} node${nodes === 1 ? '' : 's'}, ${schematic.parts.length} part${schematic.parts.length === 1 ? '' : 's'}`;
}

function start(): void {
    const canvas = requireElement(document, '#schematic', HTMLCanvasElement);
    const status = requireElement(document, '#status', HTMLElement);
    const engineStatus = requireElement(document, '#engine-status', HTMLElement);
    const importInput = requireElement(document, '#import-file', HTMLInputElement);
    const toolButtons = requireElements(document, '[data-tool]', HTMLButtonElement);

    const editor = new Editor(canvas, loadSaved() ?? EXAMPLE_SCHEMATIC);
    const client = new SimClient();
    const inspector = new Inspector(requireElement(document, '#inspector', HTMLElement), editor);
    const results = new ResultsPanel(requireElement(document, '#results', HTMLElement), editor);

    const actionButtons = new Map<Action, HTMLButtonElement>();
    for (const button of requireElements(document, '[data-action]', HTMLButtonElement)) {
        const name = button.dataset['action'];
        if (isAction(name)) {
            actionButtons.set(name, button);
        }
    }

    let lastResult: OpResult | null = null;
    let opEpoch = 0;
    let refreshTimer = 0;
    let saveTimer = 0;

    const setStatus = (kind: 'ok' | 'busy' | 'error', text: string): void => {
        status.dataset['kind'] = kind;
        status.textContent = text;
    };

    const syncInspector = (): void => inspector.update(editor.schematic, editor.selection, lastResult);

    const syncToolbar = (): void => {
        for (const button of toolButtons) {
            button.setAttribute('aria-pressed', String(button.dataset['tool'] === editor.tool));
        }
        const disable = (action: Action, disabled: boolean): void => {
            const button = actionButtons.get(action);
            if (button !== undefined) {
                button.disabled = disabled;
            }
        };
        disable('undo', !editor.canUndo);
        disable('redo', !editor.canRedo);
    };

    const refresh = async (): Promise<void> => {
        const schematic = editor.schematic;
        const epoch = ++opEpoch;
        try {
            const outcome = await client.operatingPoint(toDto(schematic));
            if (epoch !== opEpoch) {
                return; // a newer edit has already been sent
            }
            if (outcome.ok) {
                lastResult = outcome.result;
                results.showResult(schematic, outcome.result);
                setStatus('ok', describe(schematic, outcome.result));
            } else {
                lastResult = null;
                results.showError(outcome.error);
                setStatus('error', outcome.error);
            }
        } catch (error) {
            if (epoch !== opEpoch) {
                return;
            }
            lastResult = null;
            results.showError(`Simulator error: ${String(error)}`);
            setStatus('error', `Simulator error: ${String(error)}`);
        }
        editor.setResult(lastResult);
        syncInspector();
    };

    const scheduleRefresh = (): void => {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    };

    const perform = (action: Action): void => {
        switch (action) {
            case 'undo':
                editor.undo();
                break;
            case 'redo':
                editor.redo();
                break;
            case 'fit':
                editor.fit();
                break;
            case 'example':
                editor.replace(EXAMPLE_SCHEMATIC);
                break;
            case 'clear':
                editor.replace(EMPTY_SCHEMATIC);
                break;
            case 'export': {
                const url = URL.createObjectURL(new Blob([serializeSchematic(editor.schematic)], { type: 'application/json' }));
                const link = el('a', { attrs: { href: url, download: 'circuit.json' } });
                document.body.append(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                break;
            }
            case 'import':
                importInput.click();
                break;
        }
    };

    // ---- wiring ------------------------------------------------------------------------------

    editor.on('change', () => {
        scheduleRefresh();
        syncInspector();
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => save(editor.schematic), SAVE_DELAY_MS);
    });
    editor.on('select', syncInspector);
    editor.on('tool', syncToolbar);
    editor.on('history', syncToolbar);

    for (const button of toolButtons) {
        button.addEventListener('click', () => {
            const tool = button.dataset['tool'];
            if (isTool(tool)) {
                editor.setTool(tool);
            }
        });
    }
    for (const [action, button] of actionButtons) {
        button.addEventListener('click', () => perform(action));
    }

    importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        importInput.value = '';
        if (file === undefined) {
            return;
        }
        void file.text().then((text) => {
            const schematic = parseSchematic(text);
            if (schematic === null) {
                setStatus('error', `${file.name} is not a JACS schematic.`);
            } else {
                editor.replace(schematic);
            }
        });
    });

    client.ready.then(
        () => {
            engineStatus.textContent = 'WebAssembly simulator ready';
        },
        (error: unknown) => {
            engineStatus.textContent = 'Simulator failed to load';
            setStatus('error', `The WebAssembly simulator could not start: ${String(error)}`);
        },
    );

    syncToolbar();
    syncInspector();
    setStatus('busy', 'Simulating…');
    void refresh();
}

start();
