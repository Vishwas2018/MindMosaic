// Script-mode (no top-level import) so this is an ambient module declaration,
// not an augmentation. jest-axe@9 ships no TypeScript declarations.
declare module 'jest-axe' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type AxeResults = import('axe-core').AxeResults;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type RunOptions = import('axe-core').RunOptions;
  type MatchResult = { pass: boolean; message(): string };

  export const axe: (html: Element | Document, options?: RunOptions) => Promise<AxeResults>;
  export function configureAxe(
    options?: Record<string, unknown>,
  ): (html: Element | Document, options?: RunOptions) => Promise<AxeResults>;
  export const toHaveNoViolations: Record<string, (received: unknown) => MatchResult>;
}
