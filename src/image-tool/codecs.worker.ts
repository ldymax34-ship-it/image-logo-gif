/// <reference lib="webworker" />
/**
 * 图片压缩 worker：只做编码，不碰 DOM。
 * 解码与缩放放在主线程（Canvas 2D），这里接收 RGBA 像素。
 *
 * 编码器全部来自 Squoosh codec 的预编译发布（@jsquash/*，Apache-2.0）。
 * wasm 通过 `new URL(..., import.meta.url)` 交给 Vite 作为同源资源处理：
 * 开发期返回 node_modules 里的真实文件，构建期与 codec 胶水共用同一份 hashed 资源，
 * 不会重复打包；运行期只 fetch 同源 wasm，不发起任何外部请求。
 */
import jpegEncode, { init as initJpeg } from '@jsquash/jpeg/encode.js';
import { defaultOptions as webpDefaultOptions } from '@jsquash/webp/meta.js';
import webpEncFactory from '@jsquash/webp/codec/enc/webp_enc.js';
import { initSync as initOxipng, optimise_raw as optimiseRaw } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import { formatSpec, type EncodeInput, type EncodeResultMessage, type EncodedImage } from './types';

/** 与 package.json 锁定的 @jsquash 版本一一对应；Vite 会把它们当作同源 wasm 资源。 */
const CODEC_WASM = {
  jpeg: new URL('../../node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm', import.meta.url),
  webp: new URL('../../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm', import.meta.url),
  oxipng: new URL('../../node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm', import.meta.url),
} as const;

type WebpModule = Awaited<ReturnType<typeof webpEncFactory>>;

let codecs: Promise<{ webp: WebpModule }> | undefined;

async function compileWasm(url: URL | string): Promise<WebAssembly.Module> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法加载编码器（${response.status}）`);
  return WebAssembly.compile(await response.arrayBuffer());
}

async function loadCodecs(): Promise<[WebAssembly.Module, WebAssembly.Module, WebAssembly.Module]> {
  return Promise.all([
    compileWasm(CODEC_WASM.jpeg),
    compileWasm(CODEC_WASM.webp),
    compileWasm(CODEC_WASM.oxipng),
  ]);
}

/** Emscripten 模块允许外部注入已编译的 wasm，避免依赖它的默认 fetch 逻辑。 */
function initEmscriptenModule(
  moduleFactory: typeof webpEncFactory,
  wasmModule: WebAssembly.Module
): Promise<WebpModule> {
  const instantiateWasm = (
    imports: WebAssembly.Imports,
    callback: (instance: WebAssembly.Instance) => void
  ) => {
    const instance = new WebAssembly.Instance(wasmModule, imports);
    callback(instance);
    return instance.exports;
  };
  return moduleFactory({ noInitialRun: true, instantiateWasm });
}

async function ensureCodecs(): Promise<{ webp: WebpModule }> {
  if (!codecs) {
    codecs = (async () => {
      const [jpegModule, webpModule, oxipngModule] = await loadCodecs();
      await initJpeg(jpegModule);
      initOxipng(oxipngModule);
      return { webp: await initEmscriptenModule(webpEncFactory, webpModule) };
    })();
  }
  return codecs;
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function encode(request: EncodeInput): Promise<EncodedImage> {
  const { webp } = await ensureCodecs();
  const data = new Uint8ClampedArray(request.data);
  const mime = formatSpec(request.format).mime;

  if (request.format === 'jpeg') {
    const encoded = await jpegEncode(
      { data, width: request.width, height: request.height },
      { quality: request.quality }
    );
    return { bytes: new Uint8Array(encoded), width: request.width, height: request.height, mime };
  }

  if (request.format === 'webp') {
    const encoded = webp.encode(data, request.width, request.height, {
      ...webpDefaultOptions,
      quality: request.quality,
    });
    if (!encoded) throw new Error('WebP 编码失败');
    return { bytes: new Uint8Array(encoded), width: request.width, height: request.height, mime };
  }

  const encoded = optimiseRaw(data, request.width, request.height, request.pngLevel, false, false);
  return { bytes: encoded, width: request.width, height: request.height, mime };
}

self.onmessage = async (event: MessageEvent<{ id: number; input: EncodeInput }>) => {
  const { id, input } = event.data;
  try {
    const result = await encode(input);
    const message: EncodeResultMessage = {
      id,
      ok: true,
      bytes: exactBuffer(result.bytes),
      width: result.width,
      height: result.height,
      mime: result.mime,
    };
    (self as unknown as Worker).postMessage(message, [message.bytes]);
  } catch (error) {
    const message: EncodeResultMessage = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(message);
  }
};
