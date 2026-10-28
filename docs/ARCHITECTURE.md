# Arsitektur dan keputusan BeatOrbit

## Baseline

Workspace awal kosong dan tidak memiliki repositori Git atau implementasi terdahulu. Aplikasi ini merupakan implementasi baru, bukan hasil audit atau integrasi engine lama yang belum tersedia.

## Stack

TypeScript dan Vite untuk aplikasi klien; Canvas 2D untuk timeline/gameplay; Web Audio untuk decode dan clock; **Supabase Auth** untuk autentikasi wajib (halaman Login & Sign Up); **Supabase PostgreSQL (dengan Strict RLS & fungsi RPC atomik)** untuk penyimpanan metadata lagu, chart, draft, riwayat skor, dan pengaturan per akun; serta **Supabase Storage (`user-audio`)** dengan cache binary lokal **IndexedDB (`beatorbit-local-v1`)** untuk pemutaran audio cepat tanpa unduh berulang. Lagu demo disintesis secara deterministik di klien tanpa membebani kuota upload Storage.

## Sumber data

- Song berisi metadata dan identitas lokal.
- Audio disimpan terpisah sebagai Blob, menggunakan song ID sebagai key.
- Chart version 2 adalah dokumen otoritatif note, timing, posisi target, arah masuk, dan travel time.
- Draft menyimpan snapshot dan baseRevision secara terpisah.
- Results menyimpan chart ID, revision, dan score.
- Available difficulties diturunkan dari chart, bukan daftar yang harus disinkronkan terpisah.

Database version dan schemaVersion chart memiliki fungsi berbeda. Versi database pertama membuat stores songs, audio, charts, drafts, results, settings.
Import schema yang tidak didukung ditolak. Parser mengonversi chart/draft versi 1 ke versi 2 dalam memori tanpa menulis ulang data lama otomatis. Save dan ekspor mempertahankan field baru. Target ternormalisasi berada pada rentang 0.08–0.92; arah 0–<360 derajat mengarah dari target ke tepi (0 kanan, 90 bawah); travel time 200–5000 ms. Layout default versi 1 ditentukan simbol secara deterministik.

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
Interupsi gameplay membekukan audio dan menawarkan Resume atau Restart. Hold yang terinterupsi dilepas dari pemilik input tanpa judgement saat pause, lalu dapat diikat kembali dengan press simbol/sisi yang sama. Hold yang tidak ditekan kembali menjadi miss di akhir durasinya.

## Boot dan renderer

BootSession membatasi seluruh boot hingga 14 detik dan mencatat durasi tiap tahap di console lokal. Abort membatalkan generasi demo dan menutup repository/transaksi. Pembukaan database atau transaksi dibatasi 8 detik; koneksi yang selesai terlambat ditutup. Retry memakai sesi baru dan hasil pemuatan lama tidak dapat mengganti library sesi baru. Seed atomik mempertahankan record yang sudah ada.

Audio baru (demo, impor, dan relink) disimpan sebagai `{ data: ArrayBuffer, type: string }` untuk menghindari serialisasi Blob/File IndexedDB yang dapat gagal di WebKit. Konversi audio dilakukan sebelum transaksi, dibatasi timeout repository, dan menolak hasil sesi yang sudah ditutup. Pembacaan mengembalikan Blob untuk pemutaran dan tetap menerima record Blob lama tanpa migrasi atau reset database.

Generasi PCM demo menghasilkan potongan 16.384 sampel dan menyerahkan kontrol kembali ke event loop. Tidak ada upload untuk diagnosis atau demo.

`stage.ts` dipakai PlayView dan preview Studio. Posisi note dihitung langsung dari waktu audio, titik masuk di tepi, target, dan travel time; renderer tidak mengakumulasi perpindahan per frame. Matching Dual berbagi satu simbol solid sambil mempertahankan kedua state input; Dual berbeda dihubungkan garis. Bentuk simbol memakai path Canvas/SVG.

## Batas yang sengaja dipertahankan

Tidak ada auto-conversion timestamp ketika BPM berubah, auto-delete pola invalid, otomatisasi beat yang diklaim akurat, maupun engine editor terpisah.
Waveform ringkas disimpan di memori selama sesi; belum ada cache persistent.
Relink tidak menjamin file identik secara akustik; pemilihan rekaman yang sama dan pemeriksaan timing tetap diperlukan.
