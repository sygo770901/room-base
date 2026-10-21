declare module 'troika-three-text' {
  export function preloadFont(
    config: { font?: string; characters?: string },
    callback: () => void,
  ): void
}
