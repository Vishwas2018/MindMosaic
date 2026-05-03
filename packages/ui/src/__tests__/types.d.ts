// export {} makes this a module so declare module blocks below are augmentations,
// not ambient module declarations.
export {};

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<_T = unknown> {
    toHaveNoSeriousViolations(): void;
    toHaveNoViolations(): void;
    // @testing-library/jest-dom DOM matcher used in tests:
    toHaveAttribute(attr: string, value?: string | RegExp): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoSeriousViolations(): void;
    toHaveNoViolations(): void;
  }
}
