/**
 * Magic-byte (file signature) sniffing — validates that a file's actual
 * content matches a known signature for the claimed category, instead of
 * trusting the client-supplied `file.type` (fully attacker-controlled: a
 * client can label any bytes "image/jpeg").
 *
 * Only reads the first bytes needed to confirm/reject a signature — cheap
 * even for large video uploads, since Blob.slice() doesn't read the rest.
 */

export type FileCategory = 'image' | 'video' | 'audio';

function bytesMatch(header: Uint8Array, offset: number, expected: number[]): boolean {
  if (header.length < offset + expected.length) return false;
  return expected.every((byte, i) => header[offset + i] === byte);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // 'RIFF' container (WEBP, WAV both use it)
const WEBP_TAG = [0x57, 0x45, 0x42, 0x50]; // 'WEBP'
const WAVE_TAG = [0x57, 0x41, 0x56, 0x45]; // 'WAVE'
const FTYP = [0x66, 0x74, 0x79, 0x70]; // 'ftyp' box — MP4/MOV/M4A container family
const ID3 = [0x49, 0x44, 0x33]; // 'ID3' tag (MP3)

function isJpeg(h: Uint8Array): boolean {
  return bytesMatch(h, 0, JPEG);
}

function isPng(h: Uint8Array): boolean {
  return bytesMatch(h, 0, PNG);
}

function isWebp(h: Uint8Array): boolean {
  return bytesMatch(h, 0, RIFF) && bytesMatch(h, 8, WEBP_TAG);
}

function isWav(h: Uint8Array): boolean {
  return bytesMatch(h, 0, RIFF) && bytesMatch(h, 8, WAVE_TAG);
}

// MP4, MOV and M4A are all ISO base media file format containers — all carry
// an 'ftyp' box at byte offset 4. Distinguishing the brand (mp4 vs m4a) would
// require parsing further; the category (video vs audio) is already known
// from which upload field the file arrived on.
function isMp4Family(h: Uint8Array): boolean {
  return bytesMatch(h, 4, FTYP);
}

function isMp3(h: Uint8Array): boolean {
  if (bytesMatch(h, 0, ID3)) return true;
  // MPEG audio frame sync: 11 set bits at the start of a frame header.
  return h.length >= 2 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0;
}

/**
 * True if `file`'s actual byte content matches a known signature for `category`.
 */
export async function matchesFileSignature(file: Blob, category: FileCategory): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  switch (category) {
    case 'image':
      return isJpeg(header) || isPng(header) || isWebp(header);
    case 'video':
      return isMp4Family(header);
    case 'audio':
      return isMp4Family(header) || isMp3(header) || isWav(header);
    default:
      return false;
  }
}
