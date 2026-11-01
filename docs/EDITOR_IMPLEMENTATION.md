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

## Musical grid and keyboard editor (2026-11-01)

- Notes persist `grid.startBeat`, optional `grid.endBeat`, and placement subdivision alongside derived playback milliseconds. Legacy v1/v2 data acquires beat positions without quantization. BPM/offset edits preserve these endpoints; edits extending outside audio are rejected atomically.
- Grid labels retain the existing whole-note convention: 1/4 is one quarter-note beat; 1/3 and 1/6 therefore span 4/3 and 2/3 beats. Switching subdivision changes the editing grid only. Quantize explicitly changes start, end, or both; start-only preserves Hold length.
- Newly placed targets follow musical grid indices, independent of insertion order or Hold duration. Manual stage placement overrides automatic layout; “Ikuti jalur grid” restores it. Thirds have additional stage guides and finer spatial snapping.
- Dual creation uses matching symbols and automatic opposite input sides. Mixed legacy chords remain available for inspection/export/draft recovery and offer explicit conversion; publishing a chart requires valid pairs. Single conversion retains the explicitly chosen member.
- Select/Pan selects on note click, moves/resizes on note drag, pans empty space and seeks from the ruler. Shift-click adds selection; Ctrl/Cmd+A selects all. Move, delete, duplicate and Quantize operate on the selection in one history step.
- Zoom supports numeric percentages, reversible preset buttons, reset, Fit chart, Fit selection, and Ctrl/Cmd+wheel with pointer anchoring. Every visible note retains its symbol at reduced scale; notes are never replaced with count clusters.
- Transport includes previous/next selection and Stage visibility. The left app sidebar can collapse and expand. Tool and symbol choices remain accessible at short landscape sizes. Snap styling follows the same boolean and ARIA state.
- Press `?` in the editor for the shortcut reference. Tool selection: V/E. Placement types: T/H/D/Shift+D. Symbols: 1–4. Alt modifies selected notes; text inputs retain normal typing. Hold length and End Hold controls use the current grid, including thirds.
- Standard Play and Studio continue sharing stage geometry and gameplay timing. Hold and Dual Hold have explicit labels and release markers. Swing alternates with musical beat position and is identical for paired members.
- Short Hold heads remain draggable even when their release marker is close. Resizing affects the dragged Hold and its Dual partner; other selected Holds retain their lengths. Timeline highlighting includes the entire selection.
- Manual target placement records `grid.targetSubdivision` independently of the note timing subdivision, so third-grid coordinates survive saving, reloading, and later timing edits. Numeric target controls and stage dragging use the same spatial precision.
- Fractional zoom percentages use the same displayed precision in the label and input, including 0.5% and 33.5%.
