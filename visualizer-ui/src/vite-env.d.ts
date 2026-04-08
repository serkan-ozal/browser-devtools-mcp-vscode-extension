/// <reference types="vite/client" />

// Vite ?inline query — always returns a base64 data URL string
declare module '*?inline' {
    const src: string;
    export default src;
}
