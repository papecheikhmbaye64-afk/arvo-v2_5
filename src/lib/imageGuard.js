// Garde-fou du scanner : lire les dimensions d'une image depuis son en-tête, SANS la décoder.
// Un fichier de quelques Mo peut annoncer 30 000 × 30 000 pixels ; le décoder demanderait plusieurs Go de mémoire
// et ferait planter l'onglet. On refuse avant de décoder. Formats lus : JPEG, PNG, WebP, GIF, BMP.
// Les autres formats (HEIC…) retournent null : ils restent soumis à la limite de poids du fichier.

export const MAX_PIXELS = 100_000_000;   // 100 mégapixels : au-delà d'un capteur de téléphone en mode maximal
const HEAD_BYTES = 512 * 1024;           // l'en-tête JPEG peut suivre de longs blocs EXIF/ICC

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le16 = (b, o) => b[o] | (b[o + 1] << 8);
const le24 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

/** Dimensions annoncées par l'en-tête d'un fichier image (octets), ou null si le format est inconnu ou illisible. */
export function readImageSize(b) {
  if (!b || b.length < 12) return null;

  // PNG : signature puis bloc IHDR (largeur, hauteur sur 4 octets).
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b.length >= 24) return { type: 'png', width: u32(b, 16), height: u32(b, 20) };

  // GIF : largeur et hauteur sur 2 octets, petit-boutiste.
  if (ascii(b, 0, 3) === 'GIF' && b.length >= 10) return { type: 'gif', width: le16(b, 6), height: le16(b, 8) };

  // BMP.
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
    const w = u32(b, 18) | 0, h = u32(b, 22) | 0;
    return { type: 'bmp', width: Math.abs(w), height: Math.abs(h) };
  }

  // WebP : conteneur RIFF, trois variantes (VP8X étendu, VP8L sans perte, VP8 avec perte).
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 30) {
    const kind = ascii(b, 12, 4);
    if (kind === 'VP8X') return { type: 'webp', width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
    if (kind === 'VP8L' && b[20] === 0x2f) {
      const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { type: 'webp', width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { type: 'webp', width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    return null;
  }

  // JPEG : on parcourt les segments jusqu'au marqueur « début de trame » (SOF), qui porte la taille.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o += 1; continue; }
      const m = b[o + 1];
      if (m === 0xff) { o += 1; continue; }                       // octets de remplissage
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }   // marqueurs sans longueur
      const len = u16(b, o + 2);
      if (len < 2) return null;                                     // segment corrompu
      const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
      if (isSof) return { type: 'jpeg', width: u16(b, o + 7), height: u16(b, o + 5) };
      o += 2 + len;
    }
    return null;
  }
  return null;
}

/** Lit le début du fichier et retourne ses dimensions annoncées, ou null (format inconnu : on ne bloque pas sur ce critère). */
export async function peekImageSize(file) {
  try {
    const buf = await file.slice(0, HEAD_BYTES).arrayBuffer();
    return readImageSize(new Uint8Array(buf));
  } catch { return null; }
}

/** true si les dimensions annoncées sont raisonnables (ou inconnues). Une taille nulle ou absurde est refusée. */
export function sizeIsSafe(info, maxPixels = MAX_PIXELS) {
  if (!info) return true;
  const { width, height } = info;
  if (!(width > 0) || !(height > 0)) return false;
  return width * height <= maxPixels;
}
