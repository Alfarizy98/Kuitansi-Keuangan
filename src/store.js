import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_KODE_PATTERN } from './validation.js';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? '').split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function defaultSeed() {
  const now = new Date().toISOString();
  return {
    secret: crypto.randomBytes(32).toString('hex'),
    users: [
      { id: 'u-admin', username: 'admin', nama: 'Admin BPKPAD', peran: 'admin', status: 'aktif', passwordHash: hashPassword('admin123') },
      { id: 'u-op', username: 'operator', nama: 'Staf Operator', peran: 'operator', status: 'aktif', passwordHash: hashPassword('operator123') }
    ],
    config: {
      kodeRekeningPattern: DEFAULT_KODE_PATTERN,
      kop: {
        id: 'kop-1',
        baris_teks_1: 'PEMERINTAH KABUPATEN MAMUJU TENGAH',
        baris_teks_2: 'BADAN PENGELOLAAN KEUANGAN, PENDAPATAN DAN ASET DAERAH',
        aktif_sejak: '2026-01-01'
      },
      penandatangan: {
        penerima: {
          id: 'sig-1',
          peran: 'penerima',
          jabatan: 'YANG MENERIMA',
          placeholder_ttd: '${ttd_pengirim1}',
          placeholder_nama: 'KORNELIUS',
          nip: ''
        },
        bendahara: {
          id: 'sig-2',
          peran: 'bendahara',
          jabatan: 'LUNAS BAYAR - Bendahara Pengeluaran',
          placeholder_ttd: '${ttd_pengirim2}',
          placeholder_nama: 'JUNIARTI',
          nip: '19770618 200312 2 009'
        },
        pengguna_anggaran: {
          id: 'sig-3',
          peran: 'pengguna_anggaran',
          jabatan: 'SETUJU BAYAR - Pengguna Anggaran',
          placeholder_ttd: '${ttd_pengirim3}',
          placeholder_nama: 'IMANSYAH, S.Kom., M.M.',
          nip: '19800101 200901 1 025'
        }
      }
    },
    templates: [
      {
        id: 'tpl-add-siltap',
        nama: 'ADD Siltap',
        tahun_anggaran: '2026',
        kode_rekening: '5,4,02,05,01,0003',
        terima_dari: 'Bendahara Pengeluaran Badan Pengelolaan Keuangan Dan Aset Daerah',
        untuk_pembayaran_pola: 'Pembayaran (ADD) Siltap Bulan {{bulan}} Desa {{desa}} Kec. {{kecamatan}} Tahap {{tahap}} Ta {{tahun}}'
      }
    ],
    kuitansi: [
      {
        id: 'kwt-sample-1',
        tahun_anggaran: '2026',
        kode_rekening: '5,4,02,05,01,0003',
        buku_kas_no: '',
        tanggal: '26/10/2026',
        terima_dari: 'Bendahara Pengeluaran Badan Pengelolaan Keuangan Dan Aset Daerah',
        nominal: 51072000,
        terbilang: '(Lima Puluh Satu Juta Tujuh Puluh Dua Ribu Rupiah)',
        untuk_pembayaran: 'Pembayaran (ADD) Siltap Bulan Oktober Desa Tobadak Kec. Tobadak Tahap II Ta 2026',
        desa: 'Tobadak',
        status: 'draf',
        dibuat_oleh: 'u-op',
        dibuat_oleh_nama: 'Staf Operator',
        dibuat_pada: now,
        diubah_pada: now
      }
    ],
    auditLog: []
  };
}

export function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const seed = defaultSeed();
    saveDb(seed);
    return seed;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

export function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

export function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function addAudit(db, user, aksi, target, detail = '') {
  db.auditLog.unshift({
    id: crypto.randomUUID(),
    waktu: new Date().toISOString(),
    user_id: user.id,
    user_nama: user.nama,
    aksi,
    target,
    detail
  });
  if (db.auditLog.length > 500) db.auditLog.length = 500;
}
