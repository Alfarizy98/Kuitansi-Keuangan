# PRD: Aplikasi Pembuat Kuitansi Desa (ADD)

Versi 0.3 (Draft) · 18 November 2026 · Dokumen acuan: kwitansi\_desa\_ADD\_Tobadak\_September.docx

## 1. Ringkasan

Aplikasi web untuk membuat kuitansi pembayaran (contoh: ADD Siltap Desa Tobadak) dengan mengisi formulir. Aplikasi mengubah isian menjadi dokumen kuitansi yang tata letaknya sama dengan dokumen acuan. **Kop surat dan blok tanda tangan elektronik (TTE) bersifat terkunci**, sedangkan seluruh isi kuitansi dapat diubah oleh pengguna. Hasilnya dapat diunduh sebagai PDF atau berkas DOCX, atau langsung dicetak, pada kertas A4.

## 2. Latar Belakang dan Masalah

Saat ini kuitansi dibuat dengan mengedit file Word secara manual. Masalah yang muncul:

- Setiap bulan atau desa, pengguna harus membuka file lama, mengganti isi satu per satu, lalu menyimpan ulang.
- Mudah terjadi salah ketik, misalnya angka tidak sesuai dengan terbilang, atau penulisan yang tidak konsisten.
- Kop dan area tanda tangan bisa tergeser atau terhapus tanpa sengaja ketika file diedit.
- Tidak ada arsip terpusat dan nomor kuitansi sulit dilacak.

## 3. Tujuan dan Non-Tujuan

**Tujuan**

1. Pengguna dapat membuat kuitansi baru dalam waktu kurang dari 2 menit.
2. Hasil cetak/unduhan sama dengan format acuan (kop, tata letak, font) pada kertas A4.
3. Kop dan blok TTE tidak dapat diubah oleh pengguna; tata letak blok TTE baku dan sama pada setiap kuitansi.
4. Nominal dalam angka dan terbilang selalu konsisten (terbilang dibuat otomatis).
5. Kuitansi tersimpan sebagai riwayat dan dapat digandakan untuk bulan/desa berikutnya.
6. Pengguna dapat memilih jenis keluaran: unduh DOCX, unduh PDF, atau cetak langsung, semuanya pada kertas A4.

**Non-tujuan (versi 1)**

- Pembuatan, verifikasi, atau integrasi ke layanan tanda tangan elektronik (aplikasi hanya menyediakan placeholder TTE pada posisi baku).
- Integrasi ke sistem keuangan daerah (SIPD, SISKEUDES, dan sejenisnya).
- Alur persetujuan berjenjang.

## 4. Pengguna

| Peran | Deskripsi | Hak akses |
| --- | --- | --- |
| Operator | Staf yang menyiapkan kuitansi | Membuat, mengubah isi, mengunduh, melihat riwayat miliknya |
| Admin | Pengelola aplikasi | Semua hak operator, plus mengelola kop, data penandatangan (TTE), template, dan pengguna |

## 5. Analisis Dokumen Acuan

Ukuran kertas: 8,5 x 14 inci (ukuran Legal); aplikasi menyesuaikannya ke A4 (210 x 297 mm). Font: Times New Roman, Arial, dan Calibri. Margin atas 1000, kanan 1800, bawah 280, kiri 720 (satuan twips). Dokumen memuat 1 gambar (logo).

### 5.1 Bagian terkunci (tidak dapat diubah operator)

| Bagian | Isi pada dokumen acuan |
| --- | --- |
| Kop | Logo dan teks kop yang sama untuk semua desa: "PEMERINTAH KABUPATEN MAMUJU TENGAH / BADAN PENGELOLAAN KEUANGAN, PENDAPATAN DAN ASET DAERAH" |
| Judul dan label | "KWITANSI", "Tahun Anggaran", "Kode Rekening", "Buku Kas No", "Tanggal", "Telah Terima Dari", "Banyaknya Uang", "Untuk Pembayaran", "Terbilang" |
| Blok TTE | "YANG MENERIMA", "SETUJU BAYAR - Pengguna Anggaran", "LUNAS BAYAR - Bendahara Pengeluaran" beserta placeholder tanda tangan, nama, dan NIP. Tata letaknya baku dan sama di setiap kuitansi; operator tidak dapat menggeser, menambah, atau menghapus bagian apa pun. Seluruh isi blok, termasuk placeholder tanda tangan dan nama untuk Yang Menerima, Setuju Bayar, dan Lunas Bayar serta NIP kedua pejabat, bersifat tetap dan bukan isian operator |

Catatan temuan: pada kop acuan tertulis "KABUPATREN" (salah ketik, seharusnya "KABUPATEN"). Perbaikan ini dilakukan sekali oleh Admin pada data kop, bukan oleh operator.

### 5.2 Bagian yang dapat diubah (isian operator)

| Field | Contoh dari dokumen acuan | Tipe | Aturan |
| --- | --- | --- | --- |
| Tahun Anggaran | 2026 | Angka 4 digit | Wajib; default tahun berjalan |
| Kode Rekening | 5,4,02,05,01,0003 | Teks berpola | Wajib; dipisah koma; validasi pola |
| Buku Kas No | (kosong) | Teks | Opsional; nomor diisi dan diedit manual oleh pengguna (tanpa penomoran otomatis) |
| Tanggal | 26/10/2026 | Tanggal | Wajib; format DD/MM/YYYY; default hari ini |
| Telah Terima Dari | Bendahara Pengeluaran Badan Pengelolaan Keuangan Dan Aset Daerah | Teks | Wajib; default dari template |
| Nominal (angka) | Rp. 51.072.000 | Angka | Wajib; lebih dari 0; tampil dengan pemisah ribuan |
| Banyaknya Uang (terbilang) | (Lima Puluh Satu Juta Tujuh Puluh Dua Ribu Rupiah) | Teks otomatis | Dihasilkan dari nominal; dapat dikoreksi manual |
| Untuk Pembayaran | Pembayaran (ADD) Siltap Bulan Oktober Desa Tobadak Kec. Tobadak Tahap II Ta 2026 | Teks panjang | Wajib; maksimal 300 karakter |

Catatan temuan: terbilang pada dokumen acuan tertulis "LimaPuluh" (tanpa spasi). Terbilang otomatis akan menghasilkan penulisan baku "Lima Puluh".

### 5.3 Placeholder TTE pada dokumen acuan

Dokumen acuan memakai placeholder `${ttd_pengirim1}`, `${nama_pengirim1}`, `${ttd_pengirim2}`, `${nama_pengirim2}`, `${ttd_pengirim3}`, `${nama_pengirim3}`. Aplikasi hanya menyediakan placeholder ini pada posisi baku di setiap kuitansi dan tidak terhubung ke layanan TTE mana pun. Placeholder tetap utuh pada semua keluaran (PDF, DOCX, cetak) sehingga tanda tangan dapat dibubuhkan di luar aplikasi. Pada PDF dan cetak, placeholder ditampilkan apa adanya sebagai teks, seperti pada dokumen acuan. Keenam placeholder (termasuk Yang Menerima) dan NIP kedua pejabat bersifat tetap dengan format baku; hanya Admin yang dapat mengubahnya.

### 5.4 Ukuran kertas dan opsi keluaran

Semua keluaran memakai satu ukuran kertas tetap, yaitu A4 (210 x 297 mm), tanpa pilihan ukuran lain. Tata letak dokumen acuan (Legal) disesuaikan ke A4 satu kali pada template, dan blok TTE tetap berformat baku.

| Pilihan keluaran | Hasil | Catatan |
| --- | --- | --- |
| Unduh DOCX | Berkas .docx yang dapat dibuka di Microsoft Word | Placeholder TTE tetap berupa teks |
| Unduh PDF | Berkas .pdf | Kertas A4; placeholder TTE tampil sebagai teks seperti pada dokumen acuan |
| Cetak langsung | Dialog cetak perangkat | Memakai kertas A4 dan tampilan yang sama dengan PDF, termasuk placeholder TTE berupa teks |

## 6. Alur Pengguna

1. Masuk ke aplikasi, lalu membuka daftar kuitansi.
2. Memilih **Buat Kuitansi Baru** atau **Duplikat** dari kuitansi lama.
3. Mengisi formulir. Pratinjau kuitansi diperbarui langsung di sisi kanan layar.
4. Memeriksa pratinjau (kop dan blok TTE tampil tetapi tidak dapat diklik/diedit).
5. Memilih keluaran (kertas A4): Unduh DOCX, Unduh PDF, atau Cetak langsung. Kuitansi tersimpan otomatis ke riwayat.
6. Kuitansi muncul di riwayat dan dapat dibuka kembali untuk diperbaiki selama belum dikunci.

## 7. Kebutuhan Fungsional

Prioritas: **P0** wajib untuk rilis pertama, **P1** penting, **P2** nanti.

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| F-01 | Formulir input untuk semua field pada bagian 5.2 dengan validasi | P0 |
| F-02 | Pratinjau langsung (what you see is what you get) sesuai tata letak acuan pada kertas A4 | P0 |
| F-03 | Kop (satu kop untuk semua desa) dan blok TTE dirender dari template terkunci dengan tata letak baku yang sama di setiap kuitansi; tidak ada kontrol edit untuk operator | P0 |
| F-04 | Terbilang otomatis dari nominal (bahasa Indonesia baku, sampai miliar) dengan opsi koreksi manual | P0 |
| F-05 | Semua keluaran (DOCX, PDF, cetak) memakai kertas A4 tetap; template acuan disesuaikan ke A4 satu kali | P0 |
| F-06 | Unduh PDF pada kertas A4; placeholder TTE tampil sebagai teks seperti pada dokumen acuan | P0 |
| F-07 | Unduh berkas DOCX dengan tata letak setara dokumen acuan, placeholder TTE tetap ada | P0 |
| F-08 | Cetak langsung lewat dialog cetak perangkat pada kertas A4; placeholder TTE tampil sebagai teks seperti pada PDF | P0 |
| F-09 | Simpan kuitansi dan tampilkan riwayat (cari berdasarkan tanggal, desa, kata kunci) | P0 |
| F-10 | Duplikat kuitansi lama sebagai dasar kuitansi baru | P1 |
| F-11 | Template isian tersimpan, misalnya "ADD Siltap", yang mengisi default Telah Terima Dari, Kode Rekening, dan kalimat Untuk Pembayaran dengan variabel bulan, desa, kecamatan, tahap | P1 |
| F-12 | Admin mengelola kop tunggal (logo dan teks) dan data baku blok TTE (jabatan, NIP); operator tidak dapat mengubahnya | P1 |
| F-13 | Impor massal dari Excel/CSV: satu baris menghasilkan satu kuitansi, lalu unduh ZIP (PDF atau DOCX) | P1 |
| F-14 | Penguncian kuitansi final agar tidak dapat diubah, disertai catatan perubahan (log) | P1 |

## 8. Aturan Bisnis dan Validasi

- Nominal harus lebih dari 0 dan berupa bilangan bulat rupiah.
- Jika terbilang diubah manual, sistem memberi peringatan bila tidak cocok dengan nominal, tetapi tetap mengizinkan simpan setelah konfirmasi.
- Tanggal tidak boleh kosong dan tahun pada tanggal diperingatkan bila berbeda dari Tahun Anggaran.
- Kode Rekening mengikuti pola angka dipisah koma (contoh 5,4,02,05,01,0003); pola dapat dikonfigurasi Admin.
- Teks panjang pada "Untuk Pembayaran" tidak boleh membuat blok TTE terdorong ke halaman lain; pratinjau menampilkan peringatan jika hampir melebihi batas. Batas ini mengikuti area isi pada kertas A4.
- Kop dan blok TTE hanya dapat diubah oleh Admin, dan setiap perubahan tercatat. Tata letak blok TTE baku dan identik di semua kuitansi pada kertas A4.

## 9. Kebutuhan Non-Fungsional

- **Fidelitas**: hasil ekspor visual setara dokumen acuan (font, posisi logo, jarak antarbaris) pada kertas A4.
- **Kinerja**: pratinjau diperbarui kurang dari 1 detik; ekspor satu kuitansi kurang dari 5 detik.
- **Keamanan**: login wajib, peran Operator dan Admin, data tersimpan terenkripsi saat transit.
- **Kompatibilitas**: berjalan di Chrome/Edge versi terbaru pada desktop; formulir tetap dapat dipakai di tablet.
- **Ketersediaan data**: riwayat kuitansi dapat diekspor sebagai cadangan.

## 10. Model Data (Ringkas)

| Entitas | Atribut utama |
| --- | --- |
| Kuitansi | id, tahun\_anggaran, kode\_rekening, buku\_kas\_no, tanggal, terima\_dari, nominal, terbilang, untuk\_pembayaran, status (draf/final), dibuat\_oleh, dibuat\_pada, diubah\_pada |
| TemplateKuitansi | id, nama, nilai default tiap field, variabel (bulan, desa, kecamatan, tahap) |
| KopSurat | satu kop aktif untuk semua desa; id, logo, baris\_teks\_1, baris\_teks\_2, aktif\_sejak |
| Penandatangan | data tetap yang hanya diubah Admin: id, peran (penerima/pengguna anggaran/bendahara), placeholder tanda tangan dan nama, jabatan, NIP |
| Pengguna | id, nama, peran, status |

## 11. Pendekatan Teknis yang Disarankan

Gunakan **file DOCX acuan sebagai template induk**. Isian pengguna dimasukkan ke placeholder pada template tersebut, sedangkan kop dan blok TTE tetap berada di template dan tidak pernah disentuh oleh logika isian. Pendekatan ini menjaga tata letak persis seperti aslinya dan memudahkan Admin memperbarui kop. PDF dihasilkan dengan mengonversi DOCX hasil isian (misalnya via LibreOffice di sisi server), sehingga DOCX dan PDF selalu identik. Template induk disesuaikan satu kali dari Legal ke A4 (210 x 297 mm) sebelum dipakai; cetak langsung membuka dialog cetak perangkat dengan PDF yang sama.

Catatan: placeholder isian (tahun, kode rekening, tanggal, dan seterusnya) perlu ditambahkan ke template, karena pada dokumen acuan hanya placeholder TTE yang sudah berbentuk variabel.

## 12. Metrik Keberhasilan

- Waktu rata-rata membuat satu kuitansi kurang dari 2 menit.
- Nol kasus angka dan terbilang tidak cocok pada kuitansi final.
- Lebih dari 90% kuitansi dibuat tanpa mengedit file Word manual.
- Nol laporan kop atau blok TTE berubah/bergeser.

## 13. Rencana Rilis

| Tahap | Cakupan | Perkiraan |
| --- | --- | --- |
| MVP | F-01 sampai F-09 | 3 sampai 4 minggu |
| Rilis 2 | F-10 sampai F-14 | 3 minggu |

## 14. Risiko

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| Hasil PDF berbeda dari tampilan Word | Kuitansi dianggap tidak sesuai format | Uji visual dengan dokumen acuan; PDF dibuat dari DOCX yang sama |
| Teks panjang mendorong blok TTE ke halaman 2 | Dokumen tidak rapi | Batas karakter dan peringatan di pratinjau |
| Perpindahan dari Legal ke A4 (lebih pendek) membuat isi dan blok TTE tidak muat satu halaman | Tata letak tidak rapi | Template A4 diuji dengan teks terpanjang; batas karakter sesuai area isi; pratinjau memberi peringatan |
| Data penandatangan berganti (mutasi pejabat) | NIP dan nama usang | Data penandatangan dikelola Admin dengan riwayat |

## 15. Pertanyaan Terbuka

Tidak ada pertanyaan terbuka saat ini. Keputusan yang sudah ditetapkan tercatat di bagian terkait.
