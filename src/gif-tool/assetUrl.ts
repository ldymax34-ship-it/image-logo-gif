import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * 把原生文件路径转换成 Tauri 官方 asset 协议 URL。
 *
 * 只用于已经由后端授权（`asset_protocol_scope().allow_file`）或由系统文件
 * 选择器授予作用域的文件：原片（probe 时授权）、分析参考帧（分析时授权）、
 * 最终导出的 GIF（发布完成时授权）。
 *
 * 浏览器 / jsdom 环境下没有 Tauri 运行时，`convertFileSrc` 会抛错；这里返回
 * 空字符串，由调用方显示「无法预览」而不是伪造一个地址。
 */
export function toAssetUrl(path: string | undefined | null): string {
  if (!path) return '';
  try {
    return convertFileSrc(path, 'asset');
  } catch {
    return '';
  }
}
