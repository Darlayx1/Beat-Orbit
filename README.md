# BeatOrbit

Rhythm game berbasis browser dengan **Music Library**, impor audio lokal, **Orbit Studio**, dan gameplay yang menggunakan satu engine.

**[Mainkan BeatOrbit](https://darlayx1.github.io/Beat-Orbit/)** · [Status deployment](https://github.com/Darlayx1/Beat-Orbit/actions/workflows/deploy.yml)

Aplikasi dipublikasikan melalui GitHub Pages. Perubahan pada main melewati pengujian sebelum deployment otomatis.

## Menjalankan aplikasi

Memerlukan Node.js 22.12 atau lebih baru. Implementasi ini dibangun menggunakan Node.js 24.

    npm install
    npm run dev

Buka alamat Local yang ditampilkan terminal, biasanya http://127.0.0.1:5173.
Jangan membuka index.html melalui file://. Audio clock, module, dan penyimpanan browser memerlukan lingkungan HTTP/HTTPS yang sesuai.

    npm test
    npm run build
    npm run preview

Folder dist berisi build statis. Aplikasi tidak memerlukan backend.

## Alur utama

1. Pilih **Import Music** di Music Library.
2. Pilih audio, tunggu validasi decode, dan isi judul/artis.
3. Simpan lalu pilih **Open Orbit Studio**.
4. Atur nama chart, difficulty, BPM, meter, dan offset grid.
5. Pilih Tap, Hold, atau Dual, lalu tekan track simbol pada timeline.
6. Drag note untuk memindahkannya; drag ujung Hold untuk mengubah durasi.
7. Gunakan Preview atau Playtest. Playtest membaca perubahan yang belum disimpan.
8. Simpan chart, kembali ke library, lalu tekan Play.
9. Setelah selesai, results dapat digunakan untuk bermain ulang atau membuka editor.

Pada landscape kecil, tombol **Timing** membuka pengaturan chart agar timeline mendapat ruang lebih luas.
Panel properti note dibuka melalui tombol informasi pada toolbar.
Pan menggeser timeline; tombol −/+ mengatur zoom. Pinch zoom belum diimplementasikan.

## Kontrol

| Simbol | Kiri | Kanan |
| --- | --- | --- |
| Triangle △ | A | J |
| Circle ○ | S | K |
| Square □ | D | L |
| Cross × | F | ; |

Kontrol sentuh menampilkan kedua bank simbol. Note biasa menerima salah satu sisi.
Masing-masing bank berisi empat tombol lingkaran vertikal, berurutan △ ○ □ ×, di kiri dan kanan area bermain.
Dual dengan simbol sama membutuhkan sisi L dan R serta dua input terpisah.
Dual memakai simbol solid; matching Dual pada target yang sama tampil sebagai satu simbol dengan indikator input parsial. Note bergerak dari tepi layar menuju target yang ditentukan chart.
Hold terikat pada input yang memulainya. Pause membekukan waktu; setelah Resume, tekan kembali simbol/sisi Hold yang terinterupsi sampai akhir.

Studio: Space untuk preview; N untuk memasukkan simbol terpilih pada playhead; Ctrl/Cmd+Z untuk undo; Ctrl/Cmd+Shift+Z untuk redo; Ctrl/Cmd+S untuk save; Delete/Backspace untuk menghapus selection.
Shortcut diabaikan ketika mengetik.

## Fitur yang tersedia

- Impor audio dengan pemeriksaan decode runtime.
- Metadata yang dapat diedit, search, sort, preview, relink audio, dan konfirmasi penghapusan.
- Penyimpanan Blob audio, metadata, chart, draft, serta results di IndexedDB.
- Beberapa chart dan difficulty per lagu; rename, duplicate, delete, dan ekspor.
- Editor Tap/Hold/Dual, perpindahan antartrack, resize, eraser, undo/redo.
- BPM konstan, offset grid, meter 3/4 dan 4/4, snap 1/1–1/32, Tap BPM.
- Waveform ringkas dari PCM, timeline virtual, zoom, scroll, seek, dan playhead.
- Draft dengan debounce, recovery chart baru maupun tersimpan, dan pemeriksaan revision.
- Playtest snapshot melalui engine yang sama dengan Standard Play.
- Chart JSON version 2 dengan target, arah masuk, dan travel time; versi 1 dikonversi secara deterministik saat dibaca.
- Preview panggung di Studio: geser target terpilih, atur koordinat, arah masuk dan travel time di inspector, lalu scrub waktu.
- Boot memiliki tenggat 14 detik, diagnosis tahap lokal, generasi demo bertahap, timeout transaksi, dan tombol Retry tanpa reset data.
- Mirrored controls, pointer ownership, judgement, score, combo, results, dan session history.
- Tiga demo musik orisinal yang dihasilkan lokal; tidak ada audio jarak jauh.
- Font dibundel lokal. Aplikasi tidak mengirim audio atau chart ke layanan eksternal.

## Timing dan scoring

Timestamp note adalah posisi final dalam audio. Offset menentukan posisi beat nol pada grid dan tidak ditambahkan kembali saat judgement.
Mengubah BPM atau offset mempertahankan waktu note.

Quarter note adalah satu beat: snap 1/4 = satu beat; 1/8 = setengah beat.
Timestamp input dipetakan ke clock audio dengan memperhitungkan waktu pengiriman event.

| Judgement | Jendela | Nilai |
| --- | --- | --- |
| Perfect | ±45 ms | 1000 |
| Great | ±90 ms | 700 |
| Good | ±135 ms | 300 |
| Miss | Di luar jendela/tidak dipukul | 0 |

Hold dihitung satu note. Nilainya mengikuti judgement awal; pelepasan lebih dari 135 ms sebelum akhir adalah Miss.
Run yang terinterupsi menyediakan restart agar tidak melanjutkan state Hold yang ambigu.
Playtest tidak masuk session history.

## Batas dan keamanan data

- Audio: maksimum 64 MiB, 10 menit, dan 128 MiB decoded PCM.
- Pemeriksaan metadata memakai estimasi stereo konservatif sebelum decode. Track panjang dapat ditolak lebih awal.
- Chart: maksimum 10.000 note; JSON maksimum 5 MiB.
- Codec diuji dengan decode. Ekstensi MP3/WAV/M4A/AAC/OGG bukan jaminan dukungan.
- Penghapusan site data menghapus library. Persistent storage merupakan permintaan kepada browser, bukan backup.
- Ekspor JSON hanya mencakup chart. Simpan file audio asli secara terpisah.
- Draft dan saved chart dipisahkan. Saved status baru muncul setelah transaksi selesai.
- Konflik revision ditolak; simpan JSON sebelum membuka versi dari tab lain.
- Jangan memuat file tidak tepercaya yang melewati batas perangkat. Batas aplikasi mengurangi risiko, tetapi tidak menjamin anggaran memori semua perangkat.

## Pengujian dan batas verifikasi

Pengujian unit/integrasi/DOM tersedia melalui npm test. DOM dan audio mock memverifikasi perilaku kontrol serta lifecycle; keduanya tidak membuktikan codec atau latensi browser fisik.

Suite browser disiapkan di tests/browser:

    npm run test:e2e

Konfigurasi menggunakan Google Chrome yang terpasang dan WebKit, dengan preview build produksi pada port 4173. Instal runtime WebKit melalui `npx playwright install webkit` (CI Linux memakai `--with-deps`). Suite mencakup desktop, mobile landscape, serta WebKit portrait. Audio memakai gesture normal tanpa flag bypass autoplay.
WebKit menggunakan profil persisten terisolasi karena konteks ephemeral tidak dapat menyimpan Blob IndexedDB. Runtime WebKit Windows yang tidak menyediakan AudioContext secara eksplisit melewati tes audio; tes boot dan ekspor/impor tetap berjalan. Tidak ada mock audio pada suite browser.
Hasil aktual perubahan ini dicatat di docs/STATUS.md; hasil deployment lama tidak membuktikan perubahan lokal sudah dirilis.
Safari iPhone, Android fisik, multitouch fisik, kualitas suara pada perangkat, dan profiling frame time belum diverifikasi. Emulasi viewport bukan bukti perangkat fisik.

Lihat docs/STATUS.md untuk hasil aktual dan docs/MANUAL_QA.md untuk pemeriksaan perangkat.

Konfigurasi dan petunjuk deployment berada di docs/DEPLOYMENT.md. Musik dan chart localhost tidak berpindah otomatis ke domain GitHub Pages.

## Pekerjaan berikutnya

Kalibrasi audio perangkat, metronome, pinch zoom, multi-select, persistent waveform cache, PWA offline shell, automatic beat detection, variable BPM, Slide/Flick, ZIP pack, cover upload, dan controller eksternal belum tersedia.

## Struktur

    src/domain.ts     Schema, timing, validator, undo/redo
    src/storage.ts    Transaksi IndexedDB dan revision
    src/audio.ts      Audio clock, lifecycle, waveform, demo PCM
    src/studio.ts     Editor dan draft management
    src/gameplay.ts   Input matching, Hold, judgement, score
    src/play.ts       Gameplay presentation dan kontrol
    src/main.ts       Library, impor, navigasi, results
    src/style.css     Layout dan tampilan responsif
    tests/            Unit, integration, DOM, browser scenarios

Aturan permanen berada di .agents/rules/anti-loop.md dan dirujuk oleh AGENTS.md.
