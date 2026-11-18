const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  config: null,
  templates: [],
  items: [],
  currentId: null,
  terbilangManual: false
};

function todayDDMMYYYY() {
  const d = new Date();
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear()
  ].join('/');
}

function formatRupiah(n) {
  const num = Math.trunc(Number(n) || 0);
  return 'Rp. ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
function spellGroup(n) {
  if (!n) return '';
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} Belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} Puluh${n % 10 ? ' ' + SATUAN[n % 10] : ''}`;
  if (n < 200) return `Seratus${n % 100 ? ' ' + spellGroup(n % 100) : ''}`;
  return `${SATUAN[Math.floor(n / 100)]} Ratus${n % 100 ? ' ' + spellGroup(n % 100) : ''}`;
}
function autoTerbilang(amount) {
  let n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n <= 0 || n >= 1e12) return '';
  const scales = [[1e9, 'Miliar'], [1e6, 'Juta'], [1e3, 'Ribu'], [1, '']];
  const parts = [];
  for (const [div, lbl] of scales) {
    const q = Math.floor(n / div);
    if (q > 0) {
      parts.push(div === 1000 && q === 1 ? 'Seribu' : (lbl ? `${spellGroup(q)} ${lbl}` : spellGroup(q)));
      n %= div;
    }
  }
  return parts.length ? `(${parts.join(' ').trim()} Rupiah)` : '';
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Permintaan gagal');
  }
  return res.json();
}

function renderLockedConfig() {
  const { kop, penandatangan } = state.config;
  $('p-kop-1').textContent = kop.baris_teks_1;
  $('p-kop-2').textContent = kop.baris_teks_2;
  $('p-ttd-1').textContent = penandatangan.penerima.placeholder_ttd;
  $('p-nama-1').textContent = penandatangan.penerima.placeholder_nama;
  $('p-ttd-2').textContent = penandatangan.bendahara.placeholder_ttd;
  $('p-nama-2').textContent = penandatangan.bendahara.placeholder_nama;
  $('p-nip-2').textContent = `Nip: ${penandatangan.bendahara.nip}`;
  $('p-ttd-3').textContent = penandatangan.pengguna_anggaran.placeholder_ttd;
  $('p-nama-3').textContent = penandatangan.pengguna_anggaran.placeholder_nama;
  $('p-nip-3').textContent = `Nip: ${penandatangan.pengguna_anggaran.nip}`;
}

function renderPreview() {
  const tahun = $('f-tahun').value.trim();
  const kode = $('f-kode').value.trim();
  const bukukas = $('f-bukukas').value.trim();
  const tanggal = $('f-tanggal').value.trim();
  const terima = $('f-terima').value.trim();
  const nom = Number(String($('f-nominal').value).replace(/[^\d]/g, '')) || 0;
  const terbilang = $('f-terbilang').value.trim();
  const untuk = $('f-untuk').value.trim();

  $('p-tahun').textContent = tahun;
  $('p-kode').textContent = kode;
  $('p-bukukas').textContent = bukukas;
  $('p-tanggal').textContent = tanggal;
  $('p-terima').textContent = terima;
  $('p-terbilang').textContent = terbilang;
  $('p-untuk').textContent = untuk;
  $('p-nominal').textContent = formatRupiah(nom);
  $('char-count').textContent = `${untuk.length} / 300`;

  const warnings = [];
  const auto = autoTerbilang(nom);
  if (nom > 0 && terbilang && auto && terbilang.toLowerCase() !== auto.toLowerCase()) {
    warnings.push(`Terbilang manual berbeda dengan otomatis: ${auto}`);
  }
  const m = /^\d{2}\/\d{2}\/(\d{4})$/.exec(tanggal);
  if (m && /^\d{4}$/.test(tahun) && m[1] !== tahun) {
    warnings.push(`Tahun pada tanggal (${m[1]}) berbeda dengan Tahun Anggaran (${tahun}).`);
  }
  if (untuk.length >= 240) {
    warnings.push(`Uraian mendekati batas 300 karakter (${untuk.length}); pastikan blok TTE tetap satu halaman.`);
  }
  const wBox = $('form-warnings');
  if (warnings.length) { wBox.textContent = warnings.join(' | '); wBox.classList.remove('hidden'); }
  else wBox.classList.add('hidden');
}

function loadForm(item) {
  state.currentId = item?.id || null;
  state.terbilangManual = false;
  const tpl = state.templates[0] || {};
  $('f-tahun').value = item?.tahun_anggaran || tpl.tahun_anggaran || String(new Date().getFullYear());
  $('f-kode').value = item?.kode_rekening || tpl.kode_rekening || '5,4,02,05,01,0003';
  $('f-bukukas').value = item?.buku_kas_no || '';
  $('f-tanggal').value = item?.tanggal || todayDDMMYYYY();
  $('f-desa').value = item?.desa || '';
  $('f-terima').value = item?.terima_dari || tpl.terima_dari || '';
  $('f-nominal').value = item?.nominal ? String(item.nominal) : '';
  $('f-terbilang').value = item?.terbilang || '';
  $('f-untuk').value = item?.untuk_pembayaran || '';

  const isFinal = item?.status === 'final';
  $('status-pill').textContent = isFinal ? 'ARSIP (TERKUNCI)' : 'DRAF';
  $('status-pill').classList.toggle('final', isFinal);
  $('form-title').textContent = item ? (isFinal ? `Arsip Kuitansi (${item.id})` : `Edit Kuitansi (${item.id})`) : 'Kuitansi Baru';

  for (const el of $('kuitansi-form').querySelectorAll('input, textarea')) {
    el.disabled = isFinal;
  }
  $('btn-save').disabled = isFinal;
  $('btn-lock').disabled = isFinal;
  $('form-errors').classList.add('hidden');
  renderPreview();
  renderHistory();
}

function renderHistory() {
  const box = $('history-list');
  if (!state.items.length) {
    box.innerHTML = '<div class="muted">Belum ada kuitansi.</div>';
    return;
  }
  box.innerHTML = state.items.map(k => `
    <div class="hist-item ${k.id === state.currentId ? 'active' : ''}" data-id="${k.id}">
      <div>
        <div><strong>${k.desa || 'Tanpa Desa'}</strong> · ${k.tanggal} · <span class="pill ${k.status === 'final' ? 'final' : ''}">${k.status === 'final' ? 'ARSIP' : 'DRAF'}</span></div>
        <div class="hist-meta">${formatRupiah(k.nominal)} — ${k.untuk_pembayaran.slice(0, 60)}</div>
      </div>
      <div class="hist-actions">
        <button type="button" class="btn small dup-btn" data-id="${k.id}">Duplikat</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.hist-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.dup-btn')) return;
      const found = state.items.find(x => x.id === el.dataset.id);
      if (found) loadForm(found);
    });
  });
  box.querySelectorAll('.dup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const src = state.items.find(x => x.id === btn.dataset.id);
      if (!src) return;
      loadForm({ ...src, id: null, status: 'draf', tanggal: todayDDMMYYYY() });
      $('form-title').textContent = 'Duplikat Kuitansi (Baru)';
    });
  });
}

async function refreshHistory() {
  const q = encodeURIComponent($('search-input').value.trim());
  const data = await api(`/api/kuitansi?q=${q}`);
  state.items = data.items;
  renderHistory();
}

async function saveCurrent(e) {
  e?.preventDefault();
  $('form-errors').classList.add('hidden');
  const payload = {
    tahun_anggaran: $('f-tahun').value.trim(),
    kode_rekening: $('f-kode').value.trim(),
    buku_kas_no: $('f-bukukas').value.trim(),
    tanggal: $('f-tanggal').value.trim(),
    desa: $('f-desa').value.trim(),
    terima_dari: $('f-terima').value.trim(),
    nominal: $('f-nominal').value.trim(),
    terbilang: $('f-terbilang').value.trim(),
    untuk_pembayaran: $('f-untuk').value.trim()
  };

  try {
    const res = state.currentId
      ? await api(`/api/kuitansi/${state.currentId}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await api('/api/kuitansi', { method: 'POST', body: JSON.stringify(payload) });
    await refreshHistory();
    loadForm(res.item);
    return res.item;
  } catch (err) {
    $('form-errors').textContent = err.message;
    $('form-errors').classList.remove('hidden');
    return null;
  }
}

async function initSession() {
  const me = await api('/api/me');
  state.user = me.user;
  state.config = me.config;
  state.templates = me.templates;
  $('login-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  $('user-badge').textContent = 'Mode Desa';
  renderLockedConfig();
  await refreshHistory();
  loadForm(state.items[0] || null);
}

$('btn-new').addEventListener('click', () => loadForm(null));
$('search-input').addEventListener('input', () => refreshHistory());

$('f-nominal').addEventListener('input', () => {
  if (!state.terbilangManual) {
    const nom = Number(String($('f-nominal').value).replace(/[^\d]/g, '')) || 0;
    $('f-terbilang').value = autoTerbilang(nom);
  }
  renderPreview();
});
$('f-terbilang').addEventListener('input', () => { state.terbilangManual = true; renderPreview(); });
$('btn-sync-terbilang').addEventListener('click', () => {
  state.terbilangManual = false;
  const nom = Number(String($('f-nominal').value).replace(/[^\d]/g, '')) || 0;
  $('f-terbilang').value = autoTerbilang(nom);
  renderPreview();
});
for (const id of ['f-tahun', 'f-kode', 'f-bukukas', 'f-tanggal', 'f-terima', 'f-untuk']) {
  $(id).addEventListener('input', renderPreview);
}

$('btn-apply-tpl').addEventListener('click', () => {
  const tpl = state.templates[0];
  if (!tpl) return;
  const bulan = $('tpl-bulan').value.trim();
  const desa = $('tpl-desa').value.trim();
  const kec = $('tpl-kec').value.trim();
  const tahap = $('tpl-tahap').value.trim();
  const tahun = $('f-tahun').value.trim() || tpl.tahun_anggaran;
  $('f-kode').value = tpl.kode_rekening;
  $('f-terima').value = tpl.terima_dari;
  $('f-desa').value = desa;
  $('f-untuk').value = tpl.untuk_pembayaran_pola
    .replace('{{bulan}}', bulan)
    .replace('{{desa}}', desa)
    .replace('{{kecamatan}}', kec)
    .replace('{{tahap}}', tahap)
    .replace('{{tahun}}', tahun);
  renderPreview();
});

$('kuitansi-form').addEventListener('submit', saveCurrent);

$('btn-lock').addEventListener('click', async () => {
  $('form-errors').classList.add('hidden');
  if (!confirm('Kunci kuitansi ini menjadi FINAL dan pindahkan ke Arsip? Setelah dikunci tidak dapat diubah lagi.')) return;
  try {
    const saved = await saveCurrent();
    if (!saved) return;
    await api(`/api/kuitansi/${saved.id}/lock`, { method: 'POST' });
    await refreshHistory();
    loadForm(null);
  } catch (err) {
    $('form-errors').textContent = err.message;
    $('form-errors').classList.remove('hidden');
  }
});

async function ensureSavedForExport() {
  const isFinal = $('status-pill').textContent.includes('ARSIP');
  if (isFinal && state.currentId) return state.items.find(x => x.id === state.currentId);
  return saveCurrent();
}

$('btn-print').addEventListener('click', async () => {
  const item = await ensureSavedForExport();
  if (item) window.print();
});

initSession();
