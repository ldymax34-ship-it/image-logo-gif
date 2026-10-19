/**
 * `@jsquash/*` 只发布 ESM，不附带 TypeScript 声明；这里只声明本工具实际用到的
 * 深层入口，避免把整个包的类型面引入项目。
 */
declare module '@jsquash/jpeg/encode.js' {
  export function init(module?: WebAssembly.Module): Promise<unknown>;
  export default function encode(
    data: { data: Uint8ClampedArray; width: number; height: number },
    options?: Record<string, unknown>
  ): Promise<ArrayBuffer>;
}

declare module '@jsquash/webp/meta.js' {
  export const defaultOptions: Record<string, unknown>;
}

declare module '@jsquash/webp/codec/enc/webp_enc.js' {
  type EmscriptenModuleConfig = {
    noInitialRun?: boolean;
    instantiateWasm?: (
      imports: WebAssembly.Imports,
      callback: (instance: WebAssembly.Instance) => void
    ) => WebAssembly.Exports;
  };
  export default function moduleFactory(config: EmscriptenModuleConfig): Promise<{
    encode(
      data: Uint8ClampedArray,
      width: number,
      height: number,
      options: Record<string, unknown>
    ): Uint8Array | null;
  }>;
}

declare module '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js' {
  export function initSync(module: WebAssembly.Module | Uint8Array): unknown;
  export function optimise_raw(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    level: number,
    interlace: boolean,
    optimiseAlpha: boolean
  ): Uint8Array;
}
