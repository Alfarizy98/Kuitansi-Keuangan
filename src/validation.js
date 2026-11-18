import { formatTerbilang } from './terbilang.js';

export const DEFAULT_KODE_PATTERN = '^\\d+(,\\d+)+$';
export const MAX_UNTUK_PEMBAYARAN = 300;
const WARN_UNTUK_PEMBAYARAN = 240;

/**
 * Validate receipt payload against PRD Section 8 business rules.
 * Returns { errors: string[], warnings: string[], normalized: object }.
 */
export function validateKuitansi(input, config = {}) {
  const errors = [];
  const warnings = [];
  const kodePattern = config.kodeRekeningPattern || DEFAULT_KODE_PATTERN;

  const tahun = String(input.tahun_anggaran ?? '').trim();
  if (!/^\d{4}$/.test(tahun)) {
    errors.push('Tahun Anggaran wajib 4 digit angka.');
  }

  const kode = String(input.kode_rekening ?? '').trim();
  if (!kode) {
    errors.push('Kode Rekening wajib diisi.');
  } else {
    try {
      if (!new RegExp(kodePattern).test(kode)) {
        errors.push(`Kode Rekening tidak sesuai pola (${kodePattern}).`);
      }
    } catch {
      if (!new RegExp(DEFAULT_KODE_PATTERN).test(kode)) {
        errors.push('Kode Rekening tidak sesuai pola angka dipisah koma.');
      }
    }
  }

  const tanggal = String(input.tanggal ?? '').trim();
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(tanggal);
  if (!dateMatch) {
    errors.push('Tanggal wajib berformat DD/MM/YYYY.');
  } else {
    const [, dd, mm, yyyy] = dateMatch;
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      errors.push('Tanggal tidak valid.');
    } else if (/^\d{4}$/.test(tahun) && yyyy !== tahun) {
      warnings.push(`Tahun pada tanggal (${yyyy}) berbeda dengan Tahun Anggaran (${tahun}).`);
    }
  }

  const terimaDari = String(input.terima_dari ?? '').trim();
  if (!terimaDari) {
    errors.push('Telah Terima Dari wajib diisi.');
  }

  const rawNominal = String(input.nominal ?? '').replace(/[^\d]/g, '');
  const nominal = rawNominal ? Number(rawNominal) : 0;
  if (!Number.isInteger(nominal) || nominal <= 0 || nominal >= 1_000_000_000_000) {
    errors.push('Nominal wajib bilangan bulat rupiah lebih dari 0 (maks < 1 triliun).');
  }

  const autoTerbilang = nominal > 0 ? formatTerbilang(nominal) : '';
  const terbilang = String(input.terbilang ?? '').trim() || autoTerbilang;
  if (nominal > 0 && terbilang && terbilang.toLowerCase() !== autoTerbilang.toLowerCase()) {
    warnings.push(`Terbilang manual berbeda dari nominal otomatis (${autoTerbilang}).`);
  }

  const untukPembayaran = String(input.untuk_pembayaran ?? '').trim();
  if (!untukPembayaran) {
    errors.push('Untuk Pembayaran wajib diisi.');
  } else if (untukPembayaran.length > MAX_UNTUK_PEMBAYARAN) {
    errors.push(`Untuk Pembayaran maksimal ${MAX_UNTUK_PEMBAYARAN} karakter (saat ini ${untukPembayaran.length}).`);
  } else if (untukPembayaran.length >= WARN_UNTUK_PEMBAYARAN) {
    warnings.push(`Teks Untuk Pembayaran mendekati batas ${MAX_UNTUK_PEMBAYARAN} karakter (${untukPembayaran.length}); periksa agar blok TTE tetap di halaman A4.`);
  }

  return {
    errors,
    warnings,
    normalized: {
      tahun_anggaran: tahun,
      kode_rekening: kode,
      buku_kas_no: String(input.buku_kas_no ?? '').trim(),
      tanggal,
      terima_dari: terimaDari,
      nominal,
      terbilang,
      untuk_pembayaran: untukPembayaran,
      desa: String(input.desa ?? '').trim()
    }
  };
}
