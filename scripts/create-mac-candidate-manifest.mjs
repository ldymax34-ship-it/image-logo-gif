import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { assertUpdaterSignature } from './create-preview-manifest.mjs';

export function buildMacCandidateManifest({ version, notes, pubDate, macUrl, macSignature }) {
  if (!/^https:\/\//.test(macUrl)) throw new Error('Updater asset URL must be HTTPS');
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      'darwin-aarch64': {
        signature: assertUpdaterSignature(macSignature),
        url: macUrl
      }
    }
  };
}

async function main() {
  const [version, macPackage, macSig, output] = process.argv.slice(2);
  if (!version || !macPackage || !macSig || !output) {
    throw new Error('Usage: create-mac-candidate-manifest <version> <mac-package> <mac-sig> <output>');
  }
  const releaseRepository = process.env.PREVIEW_RELEASE_REPOSITORY || 'ldymax34-ship-it/ldymax34-ship-it-brand-material-workbench-releases';
  const releaseTag = process.env.PREVIEW_RELEASE_TAG || 'preview-mac-candidate';
  const releaseBase = `https://github.com/${releaseRepository}/releases/download/${releaseTag}`;
  const pubDate = new Date().toISOString();
  const manifest = buildMacCandidateManifest({
    version,
    notes: process.env.PREVIEW_RELEASE_NOTES || `macOS Preview candidate ${version} · ${pubDate} · Windows is not released by this candidate channel.`,
    pubDate,
    macUrl: `${releaseBase}/${encodeURIComponent(basename(macPackage))}`,
    macSignature: await readFile(resolve(macSig), 'utf8')
  });
  await writeFile(resolve(output), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
