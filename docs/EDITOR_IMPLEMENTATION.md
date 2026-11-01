# Checkpoint implementasi UI Orbit Studio

Tanggal: 1 November 2026, Asia/Makassar. Perubahan lokal; belum di-deploy.

Dokumen ini mencatat pelaksanaan arahan penyederhanaan editor dari PRD versi 0.2. Temuan audit awal tetap menjadi catatan baseline; checkpoint ini tidak menyatakan seluruh backlog PRD telah selesai.

## Perubahan yang tersedia

- Satu lajur untuk semua simbol. Gerakan vertikal tidak mengubah simbol; waktu dipindahkan secara horizontal. Hold memiliki rentang dan handle akhir pada lajur yang sama.
- Note berdekatan ditandai jumlah dengan tick waktu asli. Matching Dual memiliki simbol pasangan, mixed Dual memperlihatkan kedua simbol, dan daftar objek bertumpuk memungkinkan pemilihan Tap/Hold yang saling menutup. Navigasi note tersedia melalui keyboard.
- Wheel arah spawn dengan handle, delapan preset, label arah/nilai, mode sudut bebas, dan input derajat. Handle bawah berarti spawn dari bawah, yaitu 90°. Preview stage menggunakan geometri gameplay yang sama tanpa mengubah dokumen selama drag.
- Wheel mendukung keyboard, commit satu langkah undo, pembatalan lewat Escape/pointercancel/kehilangan capture, serta pemulihan fokus. Sudut custom tidak dibulatkan saat panel dibuka.
- Type Tap, Hold, Dual, dan Dual Hold tersedia pada properti. Konversi pasangan menjadi note tunggal menampilkan pilihan anggota yang dipertahankan dan tombol Batal sebelum menghapus anggota lain.
- Pilihan Pasangan/Edit anggota menjelaskan cakupan properti. Move, Duplicate, Delete, dan Eraser memakai identitas pasangan yang tersimpan, bukan kelompok visual. Mixed Dual tetap mempertahankan simbol dan targetnya ketika waktu digeser.
- Kontrol visual simbol, partner, sisi input, durasi beat, dan pusatkan target. Penempatan simbol berikutnya tidak mengedit selection yang masih aktif.
- Klik kosong pada stage tidak memindahkan target terpilih. Panel, Snap, Follow, zoom, dan visibilitas stage dipertahankan saat kembali dari Playtest.
- Inspector diperlebar dan dapat digulir. Pada landscape kecil, transport tetap terlihat dan timeline menggunakan ruler lebih ringkas. Mode Select/Erase/Pan dipadatkan agar keempat simbol serta pilihan tipe tetap terjangkau.
- Informasi penyimpanan di footer Studio membedakan workspace lokal dan akun cloud. Ini bukan perubahan protokol sinkronisasi.

## Verifikasi aktual

- `npm test -- --reporter=dot`: **137 PASS pada 9 file**. Termasuk regresi wheel, sudut custom, cancel/capture loss, fokus keyboard, operasi mixed Dual, konversi anggota, selection overlap, penjaga salah insert, klik kosong stage, dan remount panel.
- `npm run build`: **PASS**, TypeScript dan build produksi Vite.
- Tes browser editor khusus: **2 PASS**, Chrome desktop dan Chrome landscape, profil terisolasi. Alur mencakup impor WAV, penempatan satu lajur, konversi Dual, drag/keyboard wheel, preset sentuh pada context mobile, pembatalan Escape, save/reload kedua anggota, Playtest lalu kembali, serta geometri kontrol pada 1440 × 1000, 844 × 390, dan 568 × 320.
- Screenshot dan piksel canvas diperiksa selama review lokal; screenshot hasil tes tersimpan di `test-results/` dan tidak dimasukkan ke source control.

Server preview localhost tidak mencapai kondisi siap pada percobaan browser awal sehingga runner dihentikan. Pemeriksaan browser memakai berkas hasil build Vite yang tidak diubah, disajikan melalui route Playwright ke origin uji terpisah. Web Audio, rendering, input, dan IndexedDB tetap menggunakan implementasi browser; autentikasi memakai fixture pengguna lokal yang sudah tersedia. Ini membuktikan perilaku editor pada build produksi, bukan jaringan/deployment atau integrasi Supabase nyata.

Untuk mengulang pemeriksaan ini di PowerShell setelah build:

```powershell
$env:PLAYWRIGHT_BASE_URL='https://beatorbit-review.invalid/'
$env:PLAYWRIGHT_ROUTE_DIST='1'
npm run test:e2e -- --project=desktop-chrome --project=mobile-landscape-chrome editor.spec.ts
```

Tanpa kedua environment variable tersebut, tes memakai preview localhost sesuai konfigurasi proyek yang sudah ada. Hanya berkas di dalam `dist/` yang boleh disajikan oleh route uji.

## Batas pekerjaan dan verifikasi

Belum diverifikasi pada Safari/iPhone, Android fisik, Firefox, atau multitouch perangkat nyata. Context mobile Chrome merupakan emulasi viewport/input; tidak membuktikan ergonomi, latensi, atau kualitas suara perangkat fisik. Audit pembaca layar/kontras lengkap dan profiling chart 10.000 note juga belum dilakukan.

Tidak ada perubahan schema, RLS, autentikasi produksi, atau strategi sinkronisasi cloud. Risiko penyimpanan/akun dalam PRD masih perlu pekerjaan terpisah. Backlog seperti multi-select/clipboard, metronome, loop A–B, Playtest rentang, version history, dan normalisasi impor juga belum diimplementasikan pada tahap UI ini.

Tidak ada commit, push, atau deployment pada checkpoint ini.
