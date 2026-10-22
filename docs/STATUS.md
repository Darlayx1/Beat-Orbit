# Checkpoint deployment BeatOrbit

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
