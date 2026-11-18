import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadDb, saveDb, verifyPassword, hashPassword, signToken, verifyToken, addAudit } from './store.js';
import { validateKuitansi } from './validation.js';
import { generateDocx } from './docx.js';
import { generatePdf } from './pdf.js';
import { writeZip } from './zip.js';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve('public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(body);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Payload terlalu besar');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getAuthUser(req, db) {
  const cookies = parseCookies(req);
  const payload = verifyToken(cookies.kuitansi_session, db.secret);
  if (payload) {
    const found = db.users.find(u => u.id === payload.uid && u.status === 'aktif');
    if (found) return found;
  }
  // Akses publik tanpa login: default sebagai Operator agar desa lain langsung bisa memakai aplikasi
  return db.users.find(u => u.peran === 'operator' && u.status === 'aktif')
    || { id: 'u-op', username: 'operator', nama: 'Operator Desa', peran: 'operator', status: 'aktif' };
}

function parseCsvLines(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const splitRow = (line) => {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = !inQ;
      else if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  const headers = splitRow(lines[0]).map(h => h.toLowerCase());
  return lines.slice(1).map(l => {
    const vals = splitRow(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function safeFilename(name) {
  return String(name || 'kuitansi').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) {
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const target = path.resolve(PUBLIC_DIR, rel);
      if (!target.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
      return sendFile(res, target);
    }

    const db = loadDb();

    if (pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const user = db.users.find(u => u.username === String(username || '').trim() && u.status === 'aktif');
      if (!user || !verifyPassword(String(password || ''), user.passwordHash)) {
        return sendJson(res, 401, { error: 'Username atau password salah.' });
      }
      const token = signToken({ uid: user.id, exp: Date.now() + 7 * 86400_000 }, db.secret);
      addAudit(db, user, 'LOGIN', user.username);
      saveDb(db);
      return sendJson(res, 200, { user: { id: user.id, username: user.username, nama: user.nama, peran: user.peran } }, {
        'Set-Cookie': `kuitansi_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
      });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': 'kuitansi_session=; HttpOnly; Path=/; Max-Age=0'
      });
    }

    const user = getAuthUser(req, db);
    if (!user) return sendJson(res, 401, { error: 'Silakan login terlebih dahulu.' });

    if (pathname === '/api/me' && req.method === 'GET') {
      return sendJson(res, 200, {
        user: { id: user.id, username: user.username, nama: user.nama, peran: user.peran },
        config: db.config,
        templates: db.templates
      });
    }

    // List receipts (Operator sees own receipts; Admin sees all)
    if (pathname === '/api/kuitansi' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const tanggal = (url.searchParams.get('tanggal') || '').trim();
      let list = db.kuitansi;
      if (user.peran !== 'admin') list = list.filter(k => k.dibuat_oleh === user.id);
      if (tanggal) list = list.filter(k => k.tanggal.includes(tanggal));
      if (q) {
        list = list.filter(k =>
          [k.untuk_pembayaran, k.desa, k.kode_rekening, k.buku_kas_no, k.terima_dari, k.tanggal]
            .some(v => String(v || '').toLowerCase().includes(q))
        );
      }
      return sendJson(res, 200, { items: list });
    }

    // Create receipt
    if (pathname === '/api/kuitansi' && req.method === 'POST') {
      const body = await readBody(req);
      const { errors, warnings, normalized } = validateKuitansi(body, db.config);
      if (errors.length) return sendJson(res, 400, { error: errors.join(' '), errors, warnings });

      const now = new Date().toISOString();
      const item = {
        id: `kwt-${crypto.randomUUID().slice(0, 8)}`,
        ...normalized,
        status: 'draf',
        dibuat_oleh: user.id,
        dibuat_oleh_nama: user.nama,
        dibuat_pada: now,
        diubah_pada: now
      };
      db.kuitansi.unshift(item);
      addAudit(db, user, 'BUAT_KUITANSI', item.id, item.untuk_pembayaran);
      saveDb(db);
      return sendJson(res, 201, { item, warnings });
    }

    // Batch CSV import -> returns ZIP of PDF/DOCX + saves receipts
    if (pathname === '/api/import-csv' && req.method === 'POST') {
      const { csv, format = 'pdf' } = await readBody(req);
      const rows = parseCsvLines(csv);
      if (!rows.length) return sendJson(res, 400, { error: 'CSV kosong atau hanya berisi header.' });

      const created = [];
      const rowErrors = [];
      const zipEntries = [];
      const now = new Date().toISOString();

      rows.forEach((r, idx) => {
        const { errors, normalized } = validateKuitansi({
          tahun_anggaran: r.tahun_anggaran || r.tahun || String(new Date().getFullYear()),
          kode_rekening: r.kode_rekening,
          buku_kas_no: r.buku_kas_no || '',
          tanggal: r.tanggal,
          terima_dari: r.terima_dari,
          nominal: r.nominal,
          terbilang: r.terbilang || '',
          untuk_pembayaran: r.untuk_pembayaran,
          desa: r.desa || ''
        }, db.config);

        if (errors.length) {
          rowErrors.push(`Baris ${idx + 2}: ${errors.join('; ')}`);
          return;
        }
        const item = {
          id: `kwt-${crypto.randomUUID().slice(0, 8)}`,
          ...normalized,
          status: 'draf',
          dibuat_oleh: user.id,
          dibuat_oleh_nama: user.nama,
          dibuat_pada: now,
          diubah_pada: now
        };
        created.push(item);
        const fname = `${idx + 1}_${safeFilename(item.desa || item.id)}`;
        if (format === 'docx') zipEntries.push([`${fname}.docx`, generateDocx(item, db.config)]);
        else zipEntries.push([`${fname}.pdf`, generatePdf(item, db.config)]);
      });

      if (!created.length) {
        return sendJson(res, 400, { error: 'Semua baris gagal validasi.', details: rowErrors });
      }
      db.kuitansi.unshift(...created);
      addAudit(db, user, 'IMPOR_CSV', `${created.length} kuitansi`, rowErrors.length ? `${rowErrors.length} dilewati` : '');
      saveDb(db);

      const zipBuf = writeZip(zipEntries);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="kuitansi_batch_${format}.zip"`,
        'X-Import-Count': String(created.length),
        'X-Import-Skipped': String(rowErrors.length)
      });
      return res.end(zipBuf);
    }

    // Single receipt routes: /api/kuitansi/:id[/lock|/docx|/pdf]
    const match = /^\/api\/kuitansi\/([^/]+)(?:\/(lock|docx|pdf))?$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const item = db.kuitansi.find(k => k.id === id);
      if (!item) return sendJson(res, 404, { error: 'Kuitansi tidak ditemukan.' });
      if (user.peran !== 'admin' && item.dibuat_oleh !== user.id) {
        return sendJson(res, 403, { error: 'Akses ditolak.' });
      }

      if (!action && req.method === 'PUT') {
        if (item.status === 'final') {
          return sendJson(res, 409, { error: 'Kuitansi sudah dikunci (final) dan tidak dapat diubah.' });
        }
        const body = await readBody(req);
        const { errors, warnings, normalized } = validateKuitansi(body, db.config);
        if (errors.length) return sendJson(res, 400, { error: errors.join(' '), errors, warnings });

        Object.assign(item, normalized, { diubah_pada: new Date().toISOString() });
        addAudit(db, user, 'UBAH_KUITANSI', item.id, item.untuk_pembayaran);
        saveDb(db);
        return sendJson(res, 200, { item, warnings });
      }

      if (!action && req.method === 'DELETE') {
        if (item.status === 'final') return sendJson(res, 409, { error: 'Kuitansi final tidak dapat dihapus.' });
        db.kuitansi = db.kuitansi.filter(k => k.id !== id);
        addAudit(db, user, 'HAPUS_KUITANSI', id);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'lock' && req.method === 'POST') {
        item.status = 'final';
        item.diubah_pada = new Date().toISOString();
        addAudit(db, user, 'KUNCI_FINAL', item.id);
        saveDb(db);
        return sendJson(res, 200, { item });
      }

      if (action === 'docx' && req.method === 'GET') {
        const buf = generateDocx(item, db.config);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="kuitansi_${safeFilename(item.desa || item.id)}.docx"`
        });
        return res.end(buf);
      }

      if (action === 'pdf' && req.method === 'GET') {
        const buf = generatePdf(item, db.config);
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="kuitansi_${safeFilename(item.desa || item.id)}.pdf"`
        });
        return res.end(buf);
      }
    }

    // Admin endpoints
    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      if (user.peran !== 'admin') return sendJson(res, 403, { error: 'Khusus Admin.' });
      return sendJson(res, 200, {
        config: db.config,
        templates: db.templates,
        users: db.users.map(({ passwordHash, ...rest }) => rest),
        auditLog: db.auditLog.slice(0, 100)
      });
    }

    if (pathname === '/api/admin/config' && req.method === 'PUT') {
      if (user.peran !== 'admin') return sendJson(res, 403, { error: 'Khusus Admin.' });
      const body = await readBody(req);
      if (body.kop) {
        db.config.kop.baris_teks_1 = String(body.kop.baris_teks_1 || '').trim() || db.config.kop.baris_teks_1;
        db.config.kop.baris_teks_2 = String(body.kop.baris_teks_2 || '').trim() || db.config.kop.baris_teks_2;
      }
      if (body.kodeRekeningPattern) {
        new RegExp(body.kodeRekeningPattern); // validate regex
        db.config.kodeRekeningPattern = body.kodeRekeningPattern;
      }
      if (body.penandatangan) {
        for (const key of ['penerima', 'bendahara', 'pengguna_anggaran']) {
          if (body.penandatangan[key]) {
            Object.assign(db.config.penandatangan[key], {
              placeholder_ttd: String(body.penandatangan[key].placeholder_ttd ?? db.config.penandatangan[key].placeholder_ttd).trim(),
              placeholder_nama: String(body.penandatangan[key].placeholder_nama ?? db.config.penandatangan[key].placeholder_nama).trim(),
              nip: String(body.penandatangan[key].nip ?? db.config.penandatangan[key].nip).trim()
            });
          }
        }
      }
      addAudit(db, user, 'UBAH_KONFIG_ADMIN', 'kop/penandatangan/pola');
      saveDb(db);
      return sendJson(res, 200, { config: db.config });
    }

    if (pathname === '/api/admin/users' && req.method === 'POST') {
      if (user.peran !== 'admin') return sendJson(res, 403, { error: 'Khusus Admin.' });
      const { username, nama, peran, password } = await readBody(req);
      if (!username || !nama || !password) return sendJson(res, 400, { error: 'Username, nama, dan password wajib diisi.' });
      if (db.users.some(u => u.username === username.trim())) return sendJson(res, 409, { error: 'Username sudah dipakai.' });
      const newUser = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`,
        username: username.trim(),
        nama: nama.trim(),
        peran: peran === 'admin' ? 'admin' : 'operator',
        status: 'aktif',
        passwordHash: hashPassword(password)
      };
      db.users.push(newUser);
      addAudit(db, user, 'TAMBAH_PENGGUNA', newUser.username, newUser.peran);
      saveDb(db);
      const { passwordHash, ...safe } = newUser;
      return sendJson(res, 201, { user: safe });
    }

    if (pathname === '/api/backup' && req.method === 'GET') {
      const items = user.peran === 'admin' ? db.kuitansi : db.kuitansi.filter(k => k.dibuat_oleh === user.id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="backup_kuitansi.json"'
      });
      return res.end(JSON.stringify({ exported_at: new Date().toISOString(), items }, null, 2));
    }

    sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Terjadi kesalahan server.' });
  }
});

server.listen(PORT, () => {
  console.log(`Kuitansi Desa server running at http://localhost:${PORT}`);
});
