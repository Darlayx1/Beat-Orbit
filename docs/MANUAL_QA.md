# Pemeriksaan browser dan perangkat

Pengujian Chrome desktop dan viewport mobile landscape telah lulus di GitHub Actions. Daftar di bawah tetap menjadi pemeriksaan manual untuk perangkat dan browser yang disebutkan; viewport emulasi tidak membuktikan Safari iOS atau multitouch fisik.

## Catatan lingkungan

Catat tanggal, browser/versi, OS, model perangkat, output audio (speaker/kabel/Bluetooth), orientasi, dan hasil PASS/FAIL.

## Alur utama

1. Impor MP3 pendek melalui Files iPhone / file picker Android / desktop.
2. Uji WAV, AAC/M4A, serta OGG jika runtime mendukung.
3. Batalkan file picker; aplikasi harus tetap dapat digunakan.
4. Tolak berkas rusak; ulangi dengan file valid.
5. Simpan title/artist lalu refresh; preview masih berbunyi.
6. Buat chart, atur BPM dan offset; uji 3/4 dan 4/4.
7. Tambahkan Tap, Hold, Dual berbeda, dan matching Dual.
8. Drag, resize, delete, undo/redo; pastikan satu gesture satu perubahan.
9. Pada landscape kecil, uji tombol Timing, inspector, scroll, zoom, dan safe area.
10. Preview: play/pause/seek/restart tanpa musik ganda.
11. Playtest perubahan belum disimpan; kembali ke editor dan periksa history.
12. Simpan, keluar, pilih chart, mainkan, lihat results, lalu buka editor lagi.
13. Refresh ketika ada draft; pilih Restore, Discard, dan Decide later pada percobaan terpisah.
14. Ekspor JSON, impor ulang, lalu pilih audio yang benar.
15. Uji relink dengan rekaman lebih pendek; chart invalid tidak boleh dimainkan.
16. Duplikasikan chart; perubahan Easy tidak mengubah Hard.
17. Hapus lagu setelah ekspor; chart/draft/results terkait harus ikut terhapus.
18. Uji dua tab mengedit revision yang sama; tab lama tidak menimpa diam-diam.

## Input dan audio

- Dua sentuhan Triangle kiri/kanan untuk matching Dual.
- Satu sentuhan tidak menyelesaikan dua note.
- Tahan Hold sambil memukul Tap dengan ibu jari lain.
- Lepas Hold terlalu awal dan picu pointercancel.
- Uji perubahan tab, panggilan/interupsi audio, layar terkunci, dan hilangnya fokus.
- Pause harus membekukan waktu; Resume melanjutkan waktu yang sama. Tekan kembali simbol/sisi Hold yang terinterupsi; tanpa press ulang, Hold harus miss pada akhirnya.
- Restart membersihkan input serta score; run yang ditinggalkan tidak disimpan.
- Uji keluaran speaker dan Bluetooth secara terpisah. Kalibrasi belum tersedia.

## Performa dan storage

- Audio lima menit dalam batas decode dan chart 2.000 note.
- Ukur frame time, respons gesture, memori, dan jumlah sesi/source aktif.
- Ulangi play/stop/seek/restart serta buka/tutup editor.
- Uji quota storage melalui lingkungan uji; saved status tidak boleh palsu.
- Uji penolakan persistent storage dan data yang hilang setelah site data dibersihkan.
- Pastikan tidak ada audio/chart pengguna pada request jaringan.
- Pada iPhone 17 / iOS 27 / Safari pengguna: kunjungan pertama, kunjungan ulang, storage ditolak/terblokir, dan operasi tidak selesai harus mencapai library atau pesan Retry dalam 15 detik saat halaman aktif.
- Mainkan satu demo penuh: mulai lewat sentuhan, pause, resume, background/kembali, orientasi, dan results. Pastikan data library lama tetap utuh.
- Verifikasi lima posisi target, delapan arah, solid Dual (termasuk satu sentuhan parsial dan dua sentuhan bersamaan), serta Hold tanpa skor ganda.
- Ukur FPS dan memori selama sesi penuh. Sasaran 60 FPS belum dibuktikan oleh emulasi desktop.

## Matriks awal

| Lingkungan | Status |
| --- | --- |
| Chrome desktop pada GitHub Actions, alur inti dengan WAV | PASS — otomatis; pemeriksaan perangkat manual tetap diperlukan |
| Chrome viewport mobile landscape 844 × 390 | PASS — otomatis; bukan perangkat fisik |
| Firefox desktop | NOT VERIFIED |
| Safari macOS | NOT VERIFIED |
| Safari iPhone fisik | NOT VERIFIED |
| Chrome Android fisik | NOT VERIFIED |
| Latensi dan multitouch perangkat fisik | NOT VERIFIED |
| Profiling frame time dan memori perangkat | NOT VERIFIED |
