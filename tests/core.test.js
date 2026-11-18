import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTerbilang, formatRupiah } from '../src/terbilang.js';
import { validateKuitansi } from '../src/validation.js';
import { generateDocx } from '../src/docx.js';
import { generatePdf } from '../src/pdf.js';
import { readZip } from '../src/zip.js';

const sampleConfig = {
  kodeRekeningPattern: '^\\d+(,\\d+)+$',
  kop: {
    baris_teks_1: 'PEMERINTAH KABUPATEN MAMUJU TENGAH',
    baris_teks_2: 'BADAN PENGELOLAAN KEUANGAN, PENDAPATAN DAN ASET DAERAH'
  },
  penandatangan: {
    penerima: { placeholder_ttd: '${ttd_pengirim1}', placeholder_nama: '${nama_pengirim1}', nip: '' },
    bendahara: { placeholder_ttd: '${ttd_pengirim2}', placeholder_nama: '${nama_pengirim2}', nip: '19770618 200312 2 009' },
    pengguna_anggaran: { placeholder_ttd: '${ttd_pengirim3}', placeholder_nama: '${nama_pengirim3}', nip: '19800101 200901 1 025' }
  }
};

const sampleKuitansi = {
  tahun_anggaran: '2026',
  kode_rekening: '5,4,02,05,01,0003',
  buku_kas_no: 'BKU-01',
  tanggal: '26/10/2026',
  terima_dari: 'Bendahara Pengeluaran Badan Pengelolaan Keuangan Dan Aset Daerah',
  nominal: 51072000,
  terbilang: '(Lima Puluh Satu Juta Tujuh Puluh Dua Ribu Rupiah)',
  untuk_pembayaran: 'Pembayaran (ADD) Siltap Bulan Oktober Desa Tobadak & Sekitarnya'
};

test('terbilang dan formatRupiah baku', () => {
  assert.equal(formatTerbilang(51072000), '(Lima Puluh Satu Juta Tujuh Puluh Dua Ribu Rupiah)');
  assert.equal(formatTerbilang(1000), '(Seribu Rupiah)');
  assert.equal(formatTerbilang(1250000000), '(Satu Miliar Dua Ratus Lima Puluh Juta Rupiah)');
  assert.equal(formatRupiah(51072000), 'Rp. 51.072.000');
});

test('validasi aturan bisnis PRD bagian 8', () => {
  const ok = validateKuitansi(sampleKuitansi, sampleConfig);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.warnings.length, 0);

  const warn = validateKuitansi({
    ...sampleKuitansi,
    tanggal: '26/10/2025',
    terbilang: '(Lima Puluh Juta Rupiah)',
    untuk_pembayaran: 'A'.repeat(250)
  }, sampleConfig);
  assert.equal(warn.errors.length, 0);
  assert.equal(warn.warnings.length, 3);

  const bad = validateKuitansi({
    tahun_anggaran: '26',
    kode_rekening: 'invalid',
    tanggal: '31/02/2026',
    terima_dari: '',
    nominal: '0',
    untuk_pembayaran: 'X'.repeat(301)
  }, sampleConfig);
  assert.ok(bad.errors.length >= 5);
});

test('generateDocx menghasilkan DOCX A4 dengan semua isian draf & placeholder TTE utuh', () => {
  const custom = {
    ...sampleKuitansi,
    tahun_anggaran: '2027',
    kode_rekening: '5,4,02,05,01,0099',
    tanggal: '15/11/2027',
    terima_dari: 'Bendahara Desa Tobadak',
    nominal: 12500000,
    terbilang: '(Dua Belas Juta Lima Ratus Ribu Rupiah)'
  };
  const buf = generateDocx(custom, sampleConfig);
  const entries = readZip(buf);
  const xml = entries.get('word/document.xml').toString('utf8');

  assert.ok(xml.includes('<w:pgSz w:w="11906" w:h="16838"/>'));
  assert.ok(xml.includes('PEMERINTAH KABUPATEN MAMUJU TENGAH'));
  assert.ok(xml.includes('2027'));
  assert.ok(xml.includes('5,4,02,05,01,0099'));
  assert.ok(xml.includes('BKU-01'));
  assert.ok(xml.includes('15/11/2027'));
  assert.ok(xml.includes('Bendahara Desa Tobadak'));
  assert.ok(xml.includes('(Dua Belas Juta Lima Ratus Ribu Rupiah)'));
  assert.ok(xml.includes('Desa Tobadak &amp; Sekitarnya'));
  assert.ok(xml.includes('Rp. 12.500.000'));
  for (const ph of ['${ttd_pengirim1}', '${nama_pengirim1}', '${ttd_pengirim2}', '${nama_pengirim2}', '${ttd_pengirim3}', '${nama_pengirim3}']) {
    assert.ok(xml.includes(ph), `Placeholder ${ph} harus utuh`);
  }
});

test('generatePdf menghasilkan PDF A4 valid dengan placeholder TTE', () => {
  const buf = generatePdf(sampleKuitansi, sampleConfig);
  const txt = buf.toString('latin1');
  assert.ok(txt.startsWith('%PDF-1.4'));
  assert.ok(txt.includes('/MediaBox [0 0 595.28 841.89]'));
  assert.ok(txt.includes('Rp. 51.072.000'));
  assert.ok(txt.includes('${ttd_pengirim1}'));
  assert.ok(txt.trimEnd().endsWith('%%EOF'));
});
