// Reading what a scanned or typed label means: an asset QR label or a library accession code.

export type ScanTarget = { kind: 'asset'; code: string } | { kind: 'book'; code: string } | { kind: 'none'; code: '' };

const ASSET_QR = /^kinetix:\/\/asset\/(.+)$/i;

/** Asset labels carry `kinetix://asset/<tag>`; everything else typed or scanned is looked up as a library code (barcode or ISBN). */
export function readScan(raw: string): ScanTarget {
  const text = raw.trim().slice(0, 120);
  if (!text) return { kind: 'none', code: '' };
  const asset = ASSET_QR.exec(text);
  if (asset) return { kind: 'asset', code: decodeURIComponent(asset[1]!.trim()) };
  return { kind: 'book', code: text.slice(0, 40) };
}
