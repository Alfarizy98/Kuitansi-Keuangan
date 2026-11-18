const SATUAN = [
  '', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
  'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'
];

function spellGroup(n) {
  if (n === 0) return '';
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} Belas`;
  if (n < 100) {
    const rest = n % 10;
    return `${SATUAN[Math.floor(n / 10)]} Puluh${rest ? ' ' + SATUAN[rest] : ''}`;
  }
  if (n < 200) {
    const rest = n % 100;
    return `Seratus${rest ? ' ' + spellGroup(rest) : ''}`;
  }
  const rest = n % 100;
  return `${SATUAN[Math.floor(n / 100)]} Ratus${rest ? ' ' + spellGroup(rest) : ''}`;
}

/** Convert a positive integer (< 1e12) into Indonesian terbilang string. */
export function terbilangWords(amount) {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1_000_000_000_000) return '';

  const scales = [
    [1_000_000_000, 'Miliar'],
    [1_000_000, 'Juta'],
    [1_000, 'Ribu'],
    [1, '']
  ];

  let rem = n;
  const parts = [];
  for (const [div, label] of scales) {
    const q = Math.floor(rem / div);
    if (q > 0) {
      if (div === 1_000 && q === 1) {
        parts.push('Seribu');
      } else {
        parts.push(label ? `${spellGroup(q)} ${label}` : spellGroup(q));
      }
      rem %= div;
    }
  }
  return parts.join(' ').trim();
}

export function formatTerbilang(amount) {
  const words = terbilangWords(amount);
  return words ? `(${words} Rupiah)` : '';
}

export function formatRupiah(amount) {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return 'Rp. 0';
  return 'Rp. ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
