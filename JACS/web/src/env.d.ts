// Vite resolves `?url` imports to the final asset URL.
declare module '*.wasm?url' {
    const url: string;
    export default url;
}
