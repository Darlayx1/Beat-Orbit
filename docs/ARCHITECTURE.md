# Arsitektur dan keputusan BeatOrbit

## Baseline

Workspace awal kosong dan tidak memiliki repositori Git atau implementasi terdahulu. Aplikasi ini merupakan implementasi baru, bukan hasil audit atau integrasi engine lama yang belum tersedia.

## Stack

TypeScript dan Vite untuk aplikasi statis; Canvas 2D untuk timeline/gameplay; Web Audio untuk decode dan clock; IndexedDB untuk persistensi. Tidak diperlukan akun, backend, database cloud, atau upload audio.

## Sumber data

- Song berisi metadata dan identitas lokal.
- Audio disimpan terpisah sebagai Blob, menggunakan song ID sebagai key.
- Chart version 1 adalah dokumen otoritatif note dan timing.
- Draft menyimpan snapshot dan baseRevision secara terpisah.
- Results menyimpan chart ID, revision, dan score.
- Available difficulties diturunkan dari chart, bukan daftar yang harus disinkronkan terpisah.

Database version dan schemaVersion chart memiliki fungsi berbeda. Versi database pertama membuat stores songs, audio, charts, drafts, results, settings.
Import schema yang tidak didukung ditolak. Belum ada format tersimpan lama yang perlu dimigrasi.

## Clock dan transport

Posisi audio = posisi anchor + selisih AudioContext.currentTime.
UI hanya membaca clock. Timestamp input monotonic/epoch dinormalisasi dan dipetakan ke domain waktu yang sama.
Session ID melindungi restart/seek dari callback lama. Decode diserialisasi. Source, listener, serta object URL dibersihkan setelah dipakai.

## Editing

EditorDocument memisahkan dokumen dari renderer. Gesture memiliki preview; satu gesture selesai menghasilkan satu command.
Undo/redo menggunakan snapshot dengan batas 100 langkah dan anggaran total 50.000 note di history sebelumnya.
Draft disimpan setelah debounce 900 ms, dengan antrean serial. Save eksplisit menunggu antrean, melakukan revision check, dan membersihkan draft dalam transaksi yang sama.
Perubahan yang terjadi ketika save berlangsung tetap menjadi working document baru dan tidak ditandai tersimpan secara keliru.

## Notes dan ruleset

Tap/Hold adalah tipe dasar. Dual terdiri dari dua note pada waktu sama. Chain dapat dibuat sebagai rangkaian Tap.
Note biasa menggunakan side either. Matching Dual membutuhkan left/right.
Satu input down memulai maksimal satu note. Input Hold tetap terikat ke owner sampai selesai/release; keyboard repeat diabaikan.
Validator menyapu serangan simultan dan Hold aktif untuk menemukan konflik kapasitas dua ibu jari.

Ruleset awal diputuskan karena baseline lama tidak tersedia: Perfect 45 ms, Great 90 ms, Good 135 ms; nilai 1000/700/300/0.
Hold dinilai sekali dan tidak menggunakan tick scoring. Perubahan ruleset mendatang harus diberi identitas baru.

## Isolation dan navigasi

Playtest menerima deep snapshot dan tidak mengubah chart tersimpan ataupun personal best.
Editor document, history, selection, zoom, serta scroll dipertahankan ketika berpindah ke Playtest dan kembali.
Navigasi meninggalkan editor menawarkan save atau recovery draft.
Interupsi gameplay menawarkan restart; resume mid-Hold belum tersedia.

## Batas yang sengaja dipertahankan

Tidak ada auto-conversion timestamp ketika BPM berubah, auto-delete pola invalid, otomatisasi beat yang diklaim akurat, maupun engine editor terpisah.
Waveform ringkas disimpan di memori selama sesi; belum ada cache persistent.
Relink tidak menjamin file identik secara akustik; pemilihan rekaman yang sama dan pemeriksaan timing tetap diperlukan.
