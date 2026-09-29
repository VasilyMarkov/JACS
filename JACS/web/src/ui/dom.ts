export interface ElementOptions {
    readonly class?: string;
    readonly text?: string;
    readonly title?: string;
    readonly attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: ElementOptions = {},
    ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (options.class !== undefined) {
        node.className = options.class;
    }
    if (options.text !== undefined) {
        node.textContent = options.text;
    }
    if (options.title !== undefined) {
        node.title = options.title;
    }
    for (const [name, value] of Object.entries(options.attrs ?? {})) {
        node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
}

/** Finds an element that the page is required to contain, checking its type instead of casting. */
export function requireElement<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
    const found = root.querySelector(selector);
    if (!(found instanceof type)) {
        throw new Error(`page is missing ${selector} (${type.name})`);
    }
    return found;
}

export function requireElements<T extends Element>(root: ParentNode, selector: string, type: new () => T): readonly T[] {
    return [...root.querySelectorAll(selector)].filter((node): node is T => node instanceof type);
}
