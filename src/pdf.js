import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { formatRupiah } from './terbilang.js';

const LOGO_PATH = path.resolve('public', 'logo.png');

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

/** Decode an 8-bit RGBA PNG into raw RGB + Alpha buffers for PDF XObject embedding. */
function decodePngRgba(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const idatChunks = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowStart + x];
      const a = x >= bpp ? rgba[outStart + x - bpp] : 0;
      const b = y > 0 ? rgba[outStart - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? rgba[outStart - stride + x - bpp] : 0;
      let recon = val;
      if (filter === 1) recon = (val + a) & 0xff;
      else if (filter === 2) recon = (val + b) & 0xff;
      else if (filter === 3) recon = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paeth(a, b, c)) & 0xff;
      rgba[outStart + x] = recon;
    }
  }

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  for (let i = 0, j = 0, k = 0; i < rgba.length; i += 4, j += 3, k++) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
    alpha[k] = rgba[i + 3];
  }
  return {
    width,
    height,
    rgbZ: zlib.deflateSync(rgb),
    alphaZ: zlib.deflateSync(alpha)
  };
}

let cachedLogo = null;
function getLogo() {
  if (!cachedLogo && fs.existsSync(LOGO_PATH)) {
    cachedLogo = decodePngRgba(fs.readFileSync(LOGO_PATH));
  }
  return cachedLogo;
}

function pdfEsc(str) {
  return String(str ?? '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text, maxChars) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Generate a valid A4 (595.28 x 841.89 pt) PDF 1.4 Buffer matching Kuitansi BPKPAD.docx. */
export function generatePdf(kuitansi, config) {
  const W = 595.28, H = 841.89;
  const L = 42, R = 553;
  const ops = [];
  const text = (font, size, x, y, str) => {
    ops.push(`BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEsc(str)}) Tj ET`);
  };
  const centerText = (font, size, cx, y, str) => {
    const approxW = String(str ?? '').length * size * 0.48;
    text(font, size, cx - approxW / 2, y, str);
  };
  const line = (x1, y1, x2, y2, w = 0.8) => {
    ops.push(`${w} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };

  const logo = getLogo();
  if (logo) {
    ops.push(`q 29 0 0 33 44 ${(H - 78).toFixed(2)} cm /Im1 Do Q`);
  }

  // Kop (kiri) + KWITANSI (tengah) + Metadata (kanan) sejajar, garis ganda di bawah logo+kop+KWITANSI
  const kop = config.kop;
  centerText('F2', 6.8, 155, H - 52, kop.baris_teks_1);
  for (const [idx, kl] of wrapText(kop.baris_teks_2, 30).entries()) {
    centerText('F2', 6.8, 155, H - 62 - idx * 9, kl);
  }
  text('F4', 12.5, 255, H - 56, 'KWITANSI');
  line(L, H - 86, 326, H - 86, 1.5);
  line(L, H - 88.5, 326, H - 88.5, 0.5);

  const mx = 336, mv = 422;
  text('F1', 7.5, mx, H - 52, 'Tahun Anggaran');
  text('F1', 7.5, mx + 74, H - 52, ':');
  text('F1', 8.5, mv, H - 52, kuitansi.tahun_anggaran);

  text('F1', 7.5, mx, H - 64, 'Kode Rekening');
  text('F1', 7.5, mx + 74, H - 64, ':');
  text('F1', 8.5, mv, H - 64, kuitansi.kode_rekening);

  text('F1', 7.5, mx, H - 76, 'Buku Kas No');
  text('F1', 7.5, mx + 74, H - 76, ':');
  text('F1', 8.5, mv, H - 76, kuitansi.buku_kas_no || '');

  text('F1', 7.5, mx, H - 88, 'Tanggal');
  text('F1', 7.5, mx + 74, H - 88, ':');
  text('F1', 8.5, mv, H - 88, kuitansi.tanggal);

  line(L, H - 102, R, H - 102, 0.8);

  // Isi Kuitansi
  const lx = L + 6, vx = 152;
  let y = H - 118;
  text('F3', 7.5, lx, y, 'Telah Terima Dari');
  text('F1', 8, vx - 10, y, ':');
  for (const l of wrapText(kuitansi.terima_dari, 74)) {
    text('F1', 8.5, vx, y, l);
    y -= 12;
  }

  y -= 3;
  text('F1', 8.5, lx, y, 'Banyaknya Uang');
  text('F1', 8.5, vx - 10, y, ':');
  for (const l of wrapText(kuitansi.terbilang, 68)) {
    text('F2', 8.5, vx, y, l);
    y -= 12;
  }

  line(L, y + 4, R, y + 4, 0.7);
  y -= 10;
  text('F3', 7.5, lx, y, 'Untuk Pembayaran');
  text('F1', 8, vx - 10, y, ':');
  for (const l of wrapText(kuitansi.untuk_pembayaran, 74)) {
    text('F1', 8.5, vx, y, l);
    y -= 12;
  }

  line(L, y + 3, R, y + 3, 0.8);

  // Baris Terbilang (kiri) + YANG MENERIMA (kanan)
  y -= 16;
  const sig = config.penandatangan;
  text('F1', 9, lx, y, 'Terbilang :');
  ops.push(`0.8 w ${vx - 10} ${y - 7} 175 20 re S`);
  text('F1', 9.5, vx - 2, y - 1, formatRupiah(kuitansi.nominal));

  const rx = 365;
  text('F1', 7.5, rx, y + 2, 'YANG MENERIMA');
  text('F1', 7.5, rx + 26, y - 46, sig.penerima.placeholder_ttd);
  text('F1', 7.5, rx, y - 104, sig.penerima.placeholder_nama);

  // Blok 2 kolom di bawah (1 enter di bawah Yang Menerima): SETUJU BAYAR & LUNAS BAYAR
  const sy = y - 136;
  const cLeft = 75, cRight = 365;

  text('F1', 7.5, cLeft, sy, 'SETUJU BAYAR');
  text('F1', 7.5, cLeft, sy - 10, 'Pengguna Anggaran');
  text('F1', 7.5, cLeft + 26, sy - 58, sig.pengguna_anggaran.placeholder_ttd);
  text('F1', 7.5, cLeft, sy - 116, sig.pengguna_anggaran.placeholder_nama);
  text('F1', 7.5, cLeft, sy - 126, `Nip: ${sig.pengguna_anggaran.nip}`);

  text('F1', 7.5, cRight, sy, 'LUNAS BAYAR');
  text('F1', 7.5, cRight, sy - 10, 'Bendahara Pengeluaran');
  text('F1', 7.5, cRight + 26, sy - 58, sig.bendahara.placeholder_ttd);
  text('F1', 7.5, cRight, sy - 116, sig.bendahara.placeholder_nama);
  text('F1', 7.5, cRight, sy - 126, `Nip: ${sig.bendahara.nip}`);

  const stream = Buffer.from(ops.join('\n'), 'latin1');

  // Assemble PDF objects
  const objs = [];
  const addObj = (body) => { objs.push(body); return objs.length; };

  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xObjRef = logo ? '/XObject << /Im1 9 0 R >>' : '';
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >> ${xObjRef} >> /Contents 4 0 R >>`);
  addObj(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]));
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>');
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>');
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  if (logo) {
    addObj(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask 10 0 R /Length ${logo.rgbZ.length} >>\nstream\n`),
      logo.rgbZ,
      Buffer.from('\nendstream')
    ]));
    addObj(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${logo.alphaZ.length} >>\nstream\n`),
      logo.alphaZ,
      Buffer.from('\nendstream')
    ]));
  }

  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let len = chunks[0].length;
  for (let i = 0; i < objs.length; i++) {
    offsets.push(len);
    const head = Buffer.from(`${i + 1} 0 obj\n`);
    const body = Buffer.isBuffer(objs[i]) ? objs[i] : Buffer.from(objs[i]);
    const tail = Buffer.from('\nendobj\n');
    chunks.push(head, body, tail);
    len += head.length + body.length + tail.length;
  }

  const xrefPos = len;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}
