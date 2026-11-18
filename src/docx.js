import fs from 'node:fs';
import path from 'node:path';
import { readZip, writeZip } from './zip.js';
import { formatRupiah } from './terbilang.js';

const TEMPLATE_PATH = path.resolve('Kuitansi BPKPAD.docx');

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMasterEntries() {
  const raw = fs.readFileSync(TEMPLATE_PATH);
  const entries = readZip(raw);
  let xml = entries.get('word/document.xml').toString('utf8');

  // 1. Adjust Legal (12240 x 20160) -> A4 (11906 x 16838 twips) and widen right margin slightly so 3-col header fits cleanly
  xml = xml.replace(
    /<w:pgSz w:w="12240" w:h="20160"\/>/g,
    '<w:pgSz w:w="11906" w:h="16838"/>'
  );
  xml = xml.replace(
    /<w:pgMar w:top="1000" w:right="1800" w:bottom="280" w:left="720"/g,
    '<w:pgMar w:top="1000" w:right="1080" w:bottom="280" w:left="720"'
  );

  // 2. Replace Kop text runs in P1 (after bookmarkEnd)
  xml = xml.replace(
    /(<w:bookmarkEnd w:id="0"\/>)[\s\S]*?(<\/w:p>)/,
    '$1<w:r><w:t>{{KOP_LINE_1}}</w:t></w:r><w:r><w:rPr><w:spacing w:val="40"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r><w:r><w:t>{{KOP_LINE_2}}</w:t></w:r>$2'
  );

  // 3. Tahun Anggaran (P6)
  xml = xml.replace('<w:t>2026</w:t>', '<w:t>{{TAHUN_ANGGARAN}}</w:t>');

  // 4. Kode Rekening (P7)
  xml = xml.replace('<w:t>5,4,02,05,01,0003</w:t>', '<w:t>{{KODE_REKENING}}</w:t>');

  // 5. Buku Kas No (P8 - empty paragraph right after P7)
  xml = xml.replace(
    /(<w:t>\{\{KODE_REKENING\}\}<\/w:t><\/w:r><\/w:p><w:p[^>]*><w:pPr>[\s\S]*?<\/w:pPr>)(<\/w:p>)/,
    '$1<w:r><w:rPr><w:rFonts w:ascii="Calibri"/><w:spacing w:val="-2"/><w:w w:val="105"/><w:sz w:val="17"/></w:rPr><w:t>{{BUKU_KAS_NO}}</w:t></w:r>$2'
  );

  // 6. Tanggal (P9 - split across 26 / 10 /2026)
  xml = xml.replace(
    /<w:r><w:rPr><w:rFonts w:ascii="Calibri"\/><w:spacing w:val="-2"\/><w:w w:val="105"\/><w:sz w:val="17"\/><w:lang w:val="id-ID"\/><\/w:rPr><w:t>26<\/w:t><\/w:r>[\s\S]*?<w:t>\/2026<\/w:t><\/w:r>/,
    '<w:r><w:rPr><w:rFonts w:ascii="Calibri"/><w:spacing w:val="-2"/><w:w w:val="105"/><w:sz w:val="17"/><w:lang w:val="id-ID"/></w:rPr><w:t>{{TANGGAL}}</w:t></w:r>'
  );

  // 7. Telah Terima Dari (split across runs after ":")
  xml = xml.replace(
    /(<w:t>:<\/w:t><\/w:r><w:r[^>]*><w:rPr><w:spacing w:val="52"\/><w:sz w:val="14"\/><\/w:rPr><w:t xml:space="preserve">  <\/w:t><\/w:r>)[\s\S]*?(<\/w:p>)/,
    '$1<w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:t>{{TERIMA_DARI}}</w:t></w:r>$2'
  );

  // 8. Banyaknya Uang (Terbilang, split across runs after ":")
  xml = xml.replace(
    /(<w:t>:<\/w:t><\/w:r><w:r><w:rPr><w:rFonts w:ascii="Calibri"\/><w:b\/><w:spacing w:val="44"\/><w:sz w:val="17"\/><\/w:rPr><w:t xml:space="preserve">  <\/w:t><\/w:r>)[\s\S]*?(<\/w:p>)/,
    '$1<w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:b/><w:i/><w:sz w:val="16"/></w:rPr><w:t>{{TERBILANG}}</w:t></w:r>$2'
  );

  // 9. Untuk Pembayaran (split across runs inside Heading1 paragraph)
  xml = xml.replace(
    /(<w:p\b[^>]*><w:pPr><w:pStyle w:val="Heading1"\/><w:spacing w:line="268" w:lineRule="auto"\/><\/w:pPr>)[\s\S]*?(<\/w:p>)/,
    '$1<w:r><w:br w:type="column"/></w:r><w:r><w:t>{{UNTUK_PEMBAYARAN}}</w:t></w:r>$2'
  );

  // 10. Nominal
  xml = xml.replace(
    '<w:t>Rp. 51.072.000</w:t>',
    '<w:t>{{NOMINAL}}</w:t>'
  );

  // 11. Consolidate split TTE placeholders & NIPs so Admin config applies cleanly
  xml = xml.replace(/\$\{ttd_pengirim(?:<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>)?([123])(?:<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>)?\}/g, '{{TTD_$1}}');
  xml = xml.replace(/\$\{nama_pengirim(?:<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>)?([123])(?:<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>)?\}/g, '{{NAMA_$1}}');
  xml = xml.replace(
    /19800101 200901 1 0<\/w:t><\/w:r><w:r><w:rPr><w:sz w:val="14"\/><\/w:rPr><w:t>25/,
    '{{NIP_3}}'
  );
  // 12. Align LUNAS BAYAR (right cell) cleanly on left edge instead of fragile spaces
  xml = xml.replace(/<w:t xml:space="preserve">\s+LUNAS<\/w:t>/, '<w:t>LUNAS</w:t>');
  xml = xml.replace(/<w:t xml:space="preserve">\s+Bendahara<\/w:t>/, '<w:t>Bendahara</w:t>');
  xml = xml.replace(/<w:t xml:space="preserve">\s+\{\{TTD_2\}\}/, '<w:t xml:space="preserve">      {{TTD_2}}');
  xml = xml.replace(/<w:t xml:space="preserve">\s+\{\{NAMA_2\}\}/, '<w:t>{{NAMA_2}}</w:t>');
  xml = xml.replace(/<w:ind w:right="-61"/g, '<w:ind w:left="2400" w:right="0"');
  xml = xml.replace(/<w:jc w:val="center"\/><w:rPr><w:sz w:val="14"\/><\/w:rPr><\/w:pPr><w:r><w:rPr><w:sz w:val="14"\/><\/w:rPr><w:t>Nip:/g, '<w:rPr><w:sz w:val="14"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="14"/></w:rPr><w:t>Nip:');

  return { entries, masterXml: xml };
}

let cachedMaster = null;

/** Generate a filled A4 .docx Buffer from the master template. */
export function generateDocx(kuitansi, config) {
  if (!cachedMaster) cachedMaster = buildMasterEntries();

  const { entries, masterXml } = cachedMaster;
  const kop = config.kop;
  const sig = config.penandatangan;

  const replacements = {
    '{{KOP_LINE_1}}': kop.baris_teks_1,
    '{{KOP_LINE_2}}': kop.baris_teks_2,
    '{{TAHUN_ANGGARAN}}': kuitansi.tahun_anggaran,
    '{{KODE_REKENING}}': kuitansi.kode_rekening,
    '{{BUKU_KAS_NO}}': kuitansi.buku_kas_no || '',
    '{{TANGGAL}}': kuitansi.tanggal,
    '{{TERIMA_DARI}}': kuitansi.terima_dari,
    '{{TERBILANG}}': kuitansi.terbilang,
    '{{UNTUK_PEMBAYARAN}}': kuitansi.untuk_pembayaran,
    '{{NOMINAL}}': formatRupiah(kuitansi.nominal),
    '{{TTD_1}}': sig.penerima.placeholder_ttd,
    '{{NAMA_1}}': sig.penerima.placeholder_nama,
    '{{TTD_2}}': sig.bendahara.placeholder_ttd,
    '{{NAMA_2}}': sig.bendahara.placeholder_nama,
    '{{NIP_2}}': sig.bendahara.nip,
    '{{TTD_3}}': sig.pengguna_anggaran.placeholder_ttd,
    '{{NAMA_3}}': sig.pengguna_anggaran.placeholder_nama,
    '{{NIP_3}}': sig.pengguna_anggaran.nip
  };

  let xml = masterXml;
  for (const [token, val] of Object.entries(replacements)) {
    xml = xml.replaceAll(token, escapeXml(val));
  }

  const outEntries = [];
  for (const [name, buf] of entries) {
    outEntries.push([name, name === 'word/document.xml' ? Buffer.from(xml, 'utf8') : buf]);
  }
  return writeZip(outEntries);
}
