# Checkpoint lokal: loading, target bebas, dan kontrol vertikal

Tanggal: 22 Oktober 2026 (Asia/Makassar). Baseline: `4aec42123c277782089e53370918e59aa3fab5aa`.

Checkpoint ini mencatat hasil lokal sebelum deployment. Pengguna kemudian mengizinkan commit, push, dan deployment GitHub Pages; hasil rilis tersedia pada [workflow deployment](https://github.com/Darlayx1/Beat-Orbit/actions/workflows/deploy.yml). Safari iPhone 17 / iOS 27 pengguna belum diperiksa; perbaikan akar masalah perangkat tersebut belum dapat diklaim selesai.

## Implementasi dan bukti lokal

- Boot memiliki tenggat total 14 detik, timeout IndexedDB 8 detik, diagnosis durasi tiap tahap, pembatalan generasi PCM, penutupan koneksi terlambat, abort transaksi, serta Retry tanpa reset data. Seed atomik tidak menimpa record yang sudah ada.
- Chart versi 2 mempertahankan target ternormalisasi, arah masuk, dan travel time. Parser membaca versi 1 dengan layout deterministik; chart/draft lama tidak ditulis ulang otomatis. Impor/ekspor, save/reload, history, clone, dan draft memakai field baru.
- Note bergerak dari tepi menuju target diam berdasarkan waktu audio. Demo baru memperagakan lima posisi, delapan arah, Hold, dan matching Dual.
- Kontrol kiri dan kanan mengikuti referensi pengguna: empat tombol lingkaran vertikal, urutan △ ○ □ ×, mengapit panggung. Dual memakai path solid; matching Dual berbagi satu simbol dan counter input parsial. Judgement dan skor tetap memakai Gameplay yang sama untuk Standard Play dan Studio Playtest.
- Studio memiliki preview panggung untuk drag target, scrub waktu, dan inspector posisi/arah/travel time. Pause/Resume membekukan audio dan memungkinkan Hold diikat kembali ke press baru pada simbol/sisi yang sama.
- `npm test`: PASS, 93 tes pada 9 file. Mencakup migrasi, round-trip posisi, delapan arah pada tiga viewport, skipped-frame geometry, judgement boundaries, Dual, Hold/resume, timeout, late completion, preservasi seed, dan alur DOM.
- `npm run build`: PASS (TypeScript dan Vite).
- Suite browser pada `/`: 26 PASS, 6 SKIPPED. Chrome desktop/mobile memakai Web Audio asli dengan gesture normal. WebKit portrait/landscape lulus boot pertama, refresh, storage unavailable/blocked/stalled, dan ekspor/impor. Enam alur audio WebKit Windows dilewati karena runtime tidak menyediakan `AudioContext` maupun `webkitAudioContext`; tidak ada mock audio atau bypass autoplay.
- Smoke test build produksi pada prefix `/Beat-Orbit/`: 6 PASS, 2 SKIPPED (kontrol dan boot/refresh pada empat proyek; alasan skip audio WebKit sama). Aset aplikasi tidak menghasilkan respons 4xx/5xx.
- Tes controller memeriksa urutan vertikal, tombol bundar, area panggung di antara kontrol, pause/resume, orientasi, dan mengambil sampel 60 frame. Sampel desktop ini tidak membuktikan sasaran 60 FPS pada iPhone.
- Aturan `.agents/rules/anti-loop.md` sudah tersedia: frontmatter YAML valid, `trigger: always_on`, kelompok A–F, circuit breaker, dan referensi AGENTS diverifikasi. Aturan yang ada dibiarkan utuh; tidak ditemukan konflik substansial.

## Checkpoint diagnosis dan circuit breaker

Percobaan boot aplikasi pertama lulus tes unit/build dan Chrome. WebKit ephemeral gagal berulang pada penyimpanan demo; rangkaian dihentikan untuk diagnosis sebelum perubahan berikutnya. Repro terisolasi membuktikan string/ArrayBuffer berhasil, sedangkan Blob gagal dengan `UnknownError: Error preparing Blob/File data to be stored in object store`. Ini sesuai [Playwright #42795](https://github.com/microsoft/playwright/issues/42795).

Profil persisten yang ditempatkan di bawah output tes masih gagal; profil diagnosis pendek berhasil membuka library dalam sekitar 3,5 detik. Fixture kemudian memakai direktori sementara pendek dan unik, dibersihkan setelah browser ditutup. Pembatasan panjang path Windows adalah dugaan penyebab perbedaan profil, bukan temuan pada iPhone. Dengan profil pendek, boot dan penyimpanan WebKit lulus. Pemeriksaan berikutnya menunjukkan Web Audio tidak tersedia pada runtime Windows ini; tes audio dilewati dengan alasan eksplisit, tanpa percobaan patch audio spekulatif. CI Linux dikonfigurasi memasang WebKit dan menjalankan alur yang sama bila Web Audio tersedia.

## Kecocokan deployment dan batas rilis

Percobaan deployment pertama commit `1a32f67` pada [run 39791423480](https://github.com/Darlayx1/Beat-Orbit/actions/runs/39791423480) meluluskan audit, 93 tes, dan build, tetapi timeout saat instalasi dependency WebKit. Log memperlihatkan retry mirror `http://azure.archive.ubuntu.com/ubuntu` hingga job dibatalkan; tes browser dan publish belum berjalan. Perbaikan workflow mengganti daftar mirror runner ke HTTPS resmi Ubuntu, membatasi timeout jaringan apt dan durasi instalasi WebKit, tanpa melewati pemeriksaan browser.

Run berikutnya `39793980932` berhasil memasang WebKit dan kembali meluluskan audit, 93 tes, serta build, tetapi belum menerbitkan Pages karena tiga tes browser gagal. Dua kegagalan portrait berasal dari tes yang menekan tombol Timing yang memang disembunyikan pada layout portrait. Tes permainan WebKit landscape berhenti setelah browser melaporkan tidak ada PipeWire/ALSA sink; workflow kini membuat PulseAudio null sink sebelum browser suite. Perubahan ini mempertahankan tes audio berbasis gesture dan tidak mematikan pemeriksaan WebKit.

Pada pemeriksaan ini halaman produksi dan aset JS/CSS merespons HTTP 200. Build terisolasi snapshot baseline dengan prefix `/Beat-Orbit/` menghasilkan nama aset yang sama dan hash SHA-256 identik dengan deployment:

| Aset baseline/deployment | SHA-256 |
| --- | --- |
| `index-DepZhUTP.js` | `A7B81C4D8D25A2B2FE664B426BA462E9B274ED8B5ECFC05A7CC3F78ED06CB631` |
| `index-DbYvD5K2.css` | `6BD634793C49B6A95FE54D50ABF88B234C141C3EBF2609E8D16FFD06EDB7B315` |

Bukti ini menghubungkan aset produksi lama dengan snapshot yang diperiksa, bukan dengan perubahan lokal baru. Sebelum rilis tetap diperlukan Safari iPhone fisik: kunjungan awal/ulang, satu demo penuh mulai–pause–resume–results, multitouch Dual, interupsi/background, safe area, orientasi, integritas library pengguna, dan pengukuran FPS/memori. Kriteria keseluruhan pengguna belum terpenuhi sampai pemeriksaan perangkat itu lulus. Lihat MANUAL_QA.md.

---

# Riwayat deployment sebelum perubahan ini

Tanggal: 22 Oktober 2026 (Asia/Makassar).

## Aplikasi

**Alamat bermain:** https://darlayx1.github.io/Beat-Orbit/

**Repositori:** https://github.com/Darlayx1/Beat-Orbit

GitHub Pages aktif dengan source GitHub Actions. Workflow hanya mempublikasikan build setelah pemeriksaan berhasil.
Workspace lokal telah dihubungkan ke branch main dan origin repositori tersebut.

## Hasil aktual

| Pemeriksaan | Hasil |
| --- | --- |
| Unit, integration, DOM | PASS — 63 pengujian, 7 file |
| TypeScript dan build produksi | PASS |
| Browser desktop Chrome pada GitHub Actions | PASS — 3 skenario |
| Browser mobile landscape Chrome, 844 × 390 | PASS — 3 skenario |
| Deployment GitHub Pages | PASS |
| Alamat HTTPS aplikasi | PASS — HTTP 200 |
| JavaScript, CSS, favicon produksi | PASS — seluruhnya HTTP 200 |
| Font lokal produksi | PASS — 12 berkas tersedia |
| npm audit setelah pembaruan Vitest 5 | PASS — 0 temuan |
| Safari iPhone dan Android fisik | NOT VERIFIED |
| Multitouch fisik, latensi, kualitas suara perangkat | NOT VERIFIED |
| Profiling FPS dan peak memory perangkat | NOT VERIFIED |

Bukti deployment dan browser pertama yang berhasil:
https://github.com/Darlayx1/Beat-Orbit/actions/runs/39782634153

Versi terkini dan laporan setiap pemeriksaan tersedia pada:
https://github.com/Darlayx1/Beat-Orbit/actions/workflows/deploy.yml

## Yang dibuktikan browser

Kedua viewport menjalankan build produksi di subdirektori /Beat-Orbit/.

1. Impor fixture audio WAV melalui input berkas.
2. Isi metadata dan buka Orbit Studio.
3. Buat note dan nama chart.
4. Playtest perubahan yang belum disimpan sampai results.
5. Kembali, simpan, dan pilih chart di library.
6. Standard Play sampai results.
7. Refresh dan buka kembali chart.
8. Recovery draft setelah refresh.
9. Ekspor dan impor JSON dengan pemilihan audio.
10. Tidak ada page exception atau respons aset aplikasi 4xx/5xx.

Browser suite memverifikasi lifecycle audio dan permainan, tetapi tidak mengukur suara yang benar-benar didengar atau latensi sentuhan perangkat fisik. Pengujian unit terpisah mencakup judgement boundaries, ownership Dual/Hold, scoring, snapshot isolation, rollback quota, konflik revision, serta chart 2.000 note.

## Perubahan untuk deployment

- Vite base dapat diatur melalui VITE_BASE_PATH; GitHub Actions menggunakan /Beat-Orbit/.
- Favicon dan seluruh aset dibangun dengan prefix yang sesuai.
- Workflow menjalankan audit dependency, 63 tes, build, lalu browser suite sebelum deploy.
- Runner dipatok ke Ubuntu 24.04 dan memakai Chrome yang sudah tersedia.
- Playwright reports, screenshot, dan trace disimpan sebagai artifact selama tujuh hari.
- Dependency pengujian diperbarui dari Vitest 3 ke Vitest 5 untuk menyelesaikan temuan audit.
- Izin deployment dibatasi pada job Pages; tidak ada personal access token dalam source atau workflow.

## Catatan verifikasi

Pembacaan tab pratinjau desktop sebelumnya ditolak kebijakan browser dan tidak dibypass.
Pengujian browser pada tahap deployment dilakukan oleh GitHub Actions dalam profil test terisolasi.
Satu selector pengujian yang ambigu antara logo dan tombol library telah diperbaiki berdasarkan log kegagalan; assertions tetap memeriksa seluruh alur.

## Batas rilis

Aplikasi tersedia untuk dimainkan dan alur inti telah diuji di Chrome. Dukungan seluruh browser dan perangkat dalam master plan masih memerlukan pemeriksaan tambahan.

Metronome, kalibrasi perangkat, pinch zoom, multi-select, cover upload, persistent waveform cache, PWA offline shell, automatic beat detection, variable BPM, Slide/Flick, ZIP pack, dan controller eksternal belum tersedia.

Musik dan chart pengguna tetap lokal di IndexedDB. Library localhost dan GitHub Pages terpisah; ekspor chart JSON dan impor audio asli untuk memindahkan pekerjaan.
