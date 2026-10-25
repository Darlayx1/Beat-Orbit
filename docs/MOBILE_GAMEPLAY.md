# Gameplay mobile tanpa bingkai

Tanggal: 25 Oktober 2026 (Asia/Makassar). Status: perubahan lokal, belum dipublikasikan.

## Perubahan dan alasan

- Penyebab tampilan bersekat adalah header aplikasi, HUD di luar stage, bingkai controller, dan latar/batas canvas tersendiri.
- Gameplay kini memakai satu permukaan berukuran viewport dinamis (`100dvh`), tanpa border, sudut membulat, header aplikasi, atau scroll halaman. Library, Studio, dan Results tetap menggunakan layout masing-masing.
- Judul, skor, akurasi, combo, pause, tombol kembali, dan progres berada di dalam permukaan bermain. Tombol navigasi menjadi ikon pada layar kecil, dengan nama aksesibel tetap tersedia.
- Empat tombol bundar pada setiap sisi menempel ke tepi kiri/kanan dengan jarak dasar 8 px, mengikuti safe area perangkat. Ukurannya menyesuaikan lebar dan tinggi layar. Area lintasan note ditempatkan di antara kedua bank dan di bawah HUD agar tidak tertutup kontrol.
- Renderer stage menyediakan opsi tanpa latar/bingkai untuk gameplay; preview Studio tetap memakai bingkai. Standard Play dan Studio Playtest memakai PlayView dan mesin timing/input/scoring yang sama.
- Perubahan penyimpanan dan dokumen yang sudah ada di workspace dipertahankan.

## Bukti verifikasi

- `npm test`: 99 tes lulus pada 9 file.
- `npm run build`: TypeScript dan build produksi lulus.
- `git diff --check`: lulus.
- Playwright terfokus pada kontrol/orientasi dan alur impor → Studio Playtest → save → Standard Play → reopen: 4 lulus pada Chrome desktop/mobile; 4 dilewati pada WebKit Windows karena runtime tidak menyediakan Web Audio. Tidak ada mock audio.
- Pemeriksaan layout mencakup viewport awal 1440×1000 dan 844×390, kemudian 390×844, 844×390, 667×375, 568×320, dan 320×568. Stage memenuhi viewport, tidak ada scroll, tombol minimal 44 px dan tidak saling menimpa, canvas berada di antara kontrol, dan HUD berada di dalam viewport.
- Simulasi safe area memakai inset kiri/kanan 47 px dan atas/bawah 21 px pada viewport 844×390. Pemeriksaan layout yang sama lulus.
- Pause/resume, pengembalian ke library, dan pemulihan header setelah keluar gameplay lulus. Screenshot landscape/portrait telah diperiksa secara visual.
- Bukti visual lokal: `.qa/gameplay-mobile-landscape-20261025.png` dan `.qa/gameplay-mobile-portrait-20261025.png`.

## Checkpoint debugging dan batas verifikasi

- Percobaan browser dalam sandbox terhalang akses socket localhost. Proses dihentikan, diagnosis mengonfirmasi larangan socket, lalu tes dijalankan di luar sandbox dengan cache browser yang sudah terpasang.
- Pengujian pertama di luar sandbox meluluskan semua pemeriksaan layout tetapi gagal pada langkah keluar: selector mencocokkan tombol gameplay dan tombol pada dialog pause yang tersembunyi. Akar masalah berada pada selector tes. Selector dibatasi ke `.play-top`; pengujian berikutnya lulus tanpa perubahan kode aplikasi untuk masalah tersebut.
- Safari/iPhone fisik, browser chrome/address bar perangkat, safe area perangkat nyata, dan multitouch pada perangkat nyata belum diverifikasi. Pengujian ukuran viewport dan inset simulasi tidak menggantikan pemeriksaan tersebut.
