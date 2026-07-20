import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export function assertUpdaterSignature(signature) {
  const value = signature.trim();
  if (!value || /^https?:\/\//i.test(value)) throw new Error('Updater signature must be trimmed signature content, not a URL');
  return value;
}

export function buildPreviewManifest({ version, notes, pubDate, macUrl, macSignature, windowsUrl, windowsSignature }) {
  for (const url of [macUrl, windowsUrl]) if (!/^https:\/\//.test(url)) throw new Error('Updater asset URL must be HTTPS');
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'darwin-aarch64': { signature: assertUpdaterSignature(macSignature), url: macUrl },
      'windows-x86_64': { signature: assertUpdaterSignature(windowsSignature), url: windowsUrl }
    }
  };
}

async function main() {
  const [version, macPackage, macSig, windowsPackage, windowsSig, output] = process.argv.slice(2);
  if (!version || !macPackage || !macSig || !windowsPackage || !windowsSig || !output) {
    throw new Error('Usage: create-preview-manifest <version> <mac-package> <mac-sig> <windows-package> <windows-sig> <output>');
  }
  const releaseRepository = process.env.PREVIEW_RELEASE_REPOSITORY || 'ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases';
  const releaseBase = `https://github.com/${releaseRepository}/releases/download/preview`;
  const pubDate = new Date().toISOString();
  const manifest = buildPreviewManifest({
    version,
    notes: process.env.PREVIEW_RELEASE_NOTES || `Preview ${version} · ${pubDate} · Signed macOS Apple Silicon and Windows x64 updater artifacts.`,
    pubDate,
    macUrl: `${releaseBase}/${encodeURIComponent(basename(macPackage))}`,
    macSignature: await readFile(resolve(macSig), 'utf8'),
    windowsUrl: `${releaseBase}/${encodeURIComponent(basename(windowsPackage))}`,
    windowsSignature: await readFile(resolve(windowsSig), 'utf8')
  });
  await writeFile(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
