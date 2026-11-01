# PRD — Peningkatan Kualitas Orbit Studio

**Tanggal:** 1 November 2026, Asia/Makassar  
**Versi dokumen:** 0.2 — penyederhanaan satu lajur dan kontrol visual  
**Status:** Implementasi UI inti telah dimulai atas instruksi pengguna; backlog lengkap belum selesai  
**Baseline kode:** `9cbe4d3`  
**Cakupan:** Mode editor dengan satu lajur untuk seluruh simbol, kontrol arah spawn visual, tipe note termasuk Dual, penyimpanan hasil edit, preview, Playtest, dan jalur masuk/keluar yang memengaruhi pekerjaan editor.

> Bagian audit mencatat baseline sebelum implementasi. Pengguna kemudian mengizinkan eksekusi kode dan kelanjutannya; status implementasi lokal dicatat terpisah dalam [checkpoint editor](EDITOR_IMPLEMENTATION.md). Belum ada perubahan database atau deployment pada tahap UI ini.

**Arahan revisi dari pengguna:** timeline chart editor wajib cukup **satu lajur** untuk △, ○, □, dan ×. Entry Direction menjadi **wheel yang dapat diputar**; handle di bawah berarti note muncul dari bawah. Pilihan Type harus memuat **Dual**. Kontrol lain juga disederhanakan melalui interaksi visual yang sesuai. Arahan produk ini sudah ditetapkan untuk PRD; pengguna kemudian mengizinkan eksekusi UI inti dan kelanjutannya.

## 1. Kesimpulan utama

Orbit Studio sudah memiliki fondasi yang berguna: editor Tap/Hold/Dual, undo/redo, draft, waveform, pengaturan timing, preview panggung, serta Playtest menggunakan engine permainan yang sama dengan Standard Play.

Namun, editor belum memenuhi sasaran kualitas dalam PRD ini untuk pekerjaan pembuatan chart yang serius. Masalah terpenting adalah operasi Dual yang tidak konsisten, perubahan target yang terlalu mudah terjadi, indikator yang tidak selalu mencerminkan kondisi sebenarnya, serta ketahanan penyimpanan cloud yang belum cukup dibuktikan.

Prioritas produk yang disarankan:

1. Lindungi pekerjaan pengguna dan pastikan status simpan benar.
2. Jadikan operasi note dan Dual konsisten serta dapat diprediksi.
3. Perbaiki ruang kerja, navigasi, dan akses kontrol pada layar kecil.
4. Lengkapi alat produktivitas dasar sebelum menambah fitur kompleks.

Rancangan editor yang dituju menggunakan satu alur sederhana: **pilih simbol → pilih tipe → tempatkan pada satu lajur waktu → atur target dan arah secara visual → preview/Playtest**. Pengguna tidak perlu berpindah lajur untuk memilih simbol. Dropdown diganti dengan kontrol langsung untuk pilihan kecil atau properti spasial, sementara input angka tetap tersedia untuk presisi.

**128 tes pada 9 file lulus saat audit awal.** Hasil tersebut membuktikan skenario yang sudah diuji; kasus baru di bawah menunjukkan adanya celah cakupan pengujian. Revisi 0.2 hanya memperbarui dokumen dan tidak menjalankan ulang pengujian atau mengimplementasikan UI baru.

## 2. Cara audit dan batas bukti

### 2.1 Pemeriksaan yang dilakukan

- Membaca aturan workspace, struktur proyek, implementasi Studio, domain chart, rendering panggung, audio, navigasi, autentikasi, penyimpanan lokal/cloud, SQL terkait, serta tes yang tersedia.
- Menjalankan suite pengujian yang sudah ada: `npm test -- --reporter=dot` — **128 PASS, 9 file PASS**.
- Menjalankan pemeriksaan perilaku Studio di Chrome headless dengan kode sumber saat ini. Penyimpanan dan transport pada pemeriksaan terisolasi ini menggunakan pengganti sederhana; hasilnya tidak membuktikan integrasi cloud/audio.
- Membuka aplikasi dari bundel sumber dalam konteks browser terpisah dengan jalur pengguna uji lokal yang sudah ada. Memeriksa geometri editor pada 1440 × 1000, 844 × 390, dan 568 × 320. Tidak ditemukan exception halaman pada pemeriksaan layout tersebut.
- Menggunakan dokumen W3C sebagai rujukan kebutuhan aksesibilitas, bukan sebagai sertifikasi kepatuhan aplikasi.

### 2.2 Arti label bukti

| Label | Makna |
| --- | --- |
| **Teramati** | Perilaku direproduksi pada pemeriksaan browser audit ini. |
| **Kode** | Jalur perilaku terlihat langsung dalam implementasi, tetapi skenario lengkap belum direproduksi. |
| **Risiko** | Ada jalur kegagalan yang masuk akal dari implementasi; kejadian dan dampaknya perlu diuji secara khusus. |
| **Kesenjangan** | Kemampuan yang belum tersedia atau belum cukup memadai; bukan otomatis bug. |

### 2.3 Batas audit

Audit ini bukan pembuktian bahwa seluruh bug telah ditemukan. Belum dilakukan pengujian Supabase langsung, pengujian RLS dengan dua akun nyata, uji beban jaringan/cloud, pemeriksaan pembaca layar lengkap, pengukuran kontras menyeluruh, atau uji perangkat fisik.

Safari iPhone, Chrome Android, Firefox, Safari macOS, multitouch fisik, kualitas suara, latensi perangkat, dan performa sesi panjang belum diverifikasi. Pemeriksaan browser audit memakai konteks uji terisolasi, bukan akun atau library pengguna. Server Vite lokal sempat gagal memuat modul ke browser; pemeriksaan dilanjutkan memakai bundel dalam memori. Bundel audit bukan hasil build produksi Vite dan tidak membuktikan deployment.

Tidak ada kode aplikasi yang diubah. Build produksi dan suite E2E lengkap tidak dijalankan ulang dalam audit ini. Hasil pengujian historis dalam `docs/STATUS.md` tidak dianggap sebagai hasil audit baru.

## 3. Sasaran produk

### Pengguna utama

- **Pembuat chart baru:** perlu memahami alat, timing, dan cara menguji hasil tanpa takut kehilangan pekerjaan.
- **Pembuat chart berpengalaman:** perlu mengedit pola berulang dengan cepat dan presisi.
- **Pengguna tablet/ponsel landscape:** perlu mengakses kontrol penting tanpa terus berpindah posisi halaman.

### Hasil yang ingin dicapai

Pengguna dapat membuat, mengoreksi, menguji, menyimpan, dan membuka kembali chart dengan hasil yang konsisten. Tindakan pada sebuah pasangan Dual memiliki arti yang jelas. Gangguan jaringan tidak membuat pengguna kehilangan jalur pemulihan.

Editor terasa lebih ringkas: seluruh simbol berbagi satu lajur horizontal, bentuk note langsung dikenali, pilihan tipe dapat ditemukan tanpa membuka dropdown, dan posisi handle pengatur arah sesuai dengan sisi spawn di panggung.

### Prinsip yang harus dipertahankan

- Supabase Auth tetap wajib untuk workspace produksi, dengan Login dan Sign Up khusus.
- Isolasi data per akun tetap menggunakan RLS; audio menggunakan Storage `user-audio` dan cache IndexedDB.
- Standard Play dan Studio Playtest tetap memakai engine timing, input, serta scoring yang sama.
- BPM/offset mengatur grid; perubahan waktu note harus berupa tindakan eksplisit.
- Chart yang belum lengkap tetap boleh disimpan sebagai pekerjaan dalam proses. Validasi gameplay memblokir Playtest bila diperlukan, bukan menghalangi backup.
- Perubahan chart lama tidak boleh dilakukan diam-diam demi menyesuaikan UI baru.
- Satu lajur merupakan penyederhanaan tampilan timeline. Identitas simbol, waktu, pasangan Dual, target panggung, arah spawn, dan kebutuhan input gameplay tetap dipertahankan.
- Menggeser note pada timeline mengubah waktu; mengganti simbol dilakukan melalui pemilih simbol. Posisi vertikal pointer tidak menentukan simbol.
- Pilihan Type yang terlihat adalah **Tap, Hold, Dual, dan Dual Hold**. Pengguna tidak perlu menggabungkan pengaturan teknis untuk menemukan cara membuat Dual.
- Interaksi visual selalu memiliki alternatif klik/tap dan input presisi yang relevan. Animasi atau wheel tidak boleh menjadi satu-satunya cara mengedit nilai.

## 4. Prioritas

| Prioritas | Definisi |
| --- | --- |
| **P0** | Harus ditangani sebelum rilis peningkatan editor: menyangkut autentikasi produksi atau perlindungan pekerjaan terhadap kehilangan/penimpaan. Risiko P0 harus direproduksi atau disangkal sebelum dinyatakan selesai. |
| **P1** | Diperlukan agar pengeditan inti dapat dipercaya dan nyaman. |
| **P2** | Meningkatkan produktivitas, ketelitian, dan kemudahan belajar. |
| **P3** | Ditunda sampai kebutuhan pengguna dan manfaatnya terbukti. |

Prioritas di sini adalah rekomendasi produk, bukan izin untuk mulai mengubah aplikasi.

## 5. Temuan perilaku editor

| ID | Prioritas / bukti | Masalah dan dampak | Bukti sumber / reproduksi |
| --- | --- | --- | --- |
| B01 | P1 · Teramati | **Delete meninggalkan separuh matching Dual.** Satu simbol gabungan terlihat sebagai pasangan, tetapi Delete menyisakan satu note dengan `chordId` lama. Eraser juga menghapus berdasarkan satu ID. | `src/studio.ts:229,305`; dua Triangle L/R pada 1000 ms → pilih → Delete → tersisa satu anggota R. |
| B02 | P1 · Teramati | **Duplicate tidak menyalin pasangan matching Dual.** Hasilnya satu note L tanpa pasangan, meskipun objek asal tampak sebagai Dual. | `src/studio.ts:230–232`; pasangan pada 1000 ms, BPM 120 → Duplicate → hanya satu note baru di 1500 ms. |
| B03 | P1 · Teramati | **Tombol simbol dan inspector memiliki arti berbeda.** Tombol simbol hanya mengubah anggota terpilih; inspector mengubah kelompok visual. Mengganti simbol dapat memecah matching Dual tanpa perintah pisahkan. | `src/studio.ts:208–210,262–268`; pasangan Triangle → tombol Circle → hasil Circle + Triangle. |
| B04 | P1 · Teramati | **Dual dengan simbol berbeda tidak diperlakukan sebagai satu pasangan saat mengubah waktu.** `groupNotes()` memisahkan berdasarkan simbol dan layout, lalu hasil pengelompokan visual dipakai untuk edit. | `src/stage.ts:93–103`, `src/studio.ts:262–267,328–334`; ubah waktu Triangle ke 2000 ms → Circle tetap 1000 ms dengan `chordId` sama. |
| B05 | P1 · Teramati | **Klik area kosong panggung bisa memindahkan target terpilih.** Ketika tidak ada target dekat pointer, selection lama tetap dipakai dan posisi klik menjadi posisi target baru. Risiko salah edit tinggi. | `src/studio.ts:368–381`; target terpilih `(0.5,0.2)` → klik jauh → menjadi `(0.1,0.1)` pada fixture audit. Pemanggilan handler memakai koordinat sintetis dan capture pointer pengganti. |
| B06 | P1 · Teramati | **Indikator editor salah setelah unmount/mount**, termasuk jalur kembali dari Playtest. Snap dan Follow selalu tampil aktif, zoom kembali berlabel 100%, sementara nilai internal tetap dipertahankan. Inspector yang terbuka juga tertutup. | `src/studio.ts:76–79,108–115,234–241`; nilai Snap=false, Follow=false, zoom=220 → indikator aktif, aktif, 100%. `src/main.ts:199,205,425` memasang ulang editor. |
| B07 | P2 · Kode | **Seek, Pan, dan Scrub mematikan Follow tanpa memperbarui indikatornya.** Pengguna bisa mengira playhead akan diikuti padahal tidak. | `src/studio.ts:252,296,313`; perubahan flag tidak menyelaraskan kelas tombol. |
| B08 | P2 · Teramati | **Shortcut N tetap membuat Tap saat alat Eraser aktif.** Jalur insert tidak memeriksa apakah alat aktif memang alat penempatan. Risiko note tak sengaja. | `src/studio.ts:218,282,346–359`; Eraser → N → note Tap baru di playhead. Alat Select/Pan memiliki jalur serupa. |
| B09 | P1 · Kode | **Perubahan form baru dicatat ketika event `change` terjadi.** Saat pengguna masih mengetik nama, isi yang terlihat belum tentu masuk dokumen/draft; penjaga keluar membaca `dirty` dokumen. Shortcut Save juga diabaikan ketika fokus berada di input. | `src/studio.ts:98,250–260,279`, `src/main.ts:429`; perlu uji tutup tab tanpa blur untuk menetapkan dampak kehilangan input di tiap browser. |
| B10 | P2 · Kode | **Preview gerakan matching Dual bisa tidak mewakili objek yang digeser.** Hit testing memilih note dari urutan terbalik, tetapi timeline hanya menggambar anggota pertama kelompok dan mencocokkan preview berdasarkan ID anggota itu. Selection anggota kedua juga tidak selalu terlihat. | `src/studio.ts:301,415–425`; perlu regresi yang memilih masing-masing anggota pasangan. |
| B11 | P2 · Kode | **Label tombol Preview tetap “Preview audio” saat ikon berubah menjadi Pause.** Makna tindakan bagi pembaca layar tidak ikut berubah. Status simpan dan tombol toggle juga belum memiliki semantik status/state yang memadai. | `src/studio.ts:59,76–79,171–174,431`; canvas tanpa `tabindex`, toggle tanpa `aria-pressed`, save status tanpa live region khusus. Toast global sudah memiliki live region; itu perlu dipertahankan. |
| B12 | P2 · Kode | **Pembatalan gesture belum seragam.** Escape membatalkan gesture timeline tetapi tidak membersihkan `stageDrag`; stage juga tidak memasang `lostpointercapture`. | `src/studio.ts:91,103–104,286,383`; dampak pada perangkat/skenario kehilangan capture perlu diuji. |

**Keputusan desain yang diusulkan untuk B01–B04:** Dual memiliki identitas pasangan logis tersendiri, terpisah dari kelompok rendering. Secara default pilih, pindah waktu, hapus, dan duplicate berlaku untuk pasangan. Pengeditan satu anggota harus melalui mode eksplisit “Edit anggota”. Simbol berbeda tetap boleh dipertahankan dalam pasangan.

## 6. Risiko penyimpanan, akun, dan integritas data

| ID | Prioritas / bukti | Risiko dan alasan | Kebutuhan tindak lanjut |
| --- | --- | --- | --- |
| R01 | P0 · Kode | **Jalur pengguna uji dapat membuka workspace tanpa Supabase Auth.** `localStorage['beatorbit-test-user']` dan `navigator.webdriver` menghasilkan pengguna `localOnly` tanpa pembatasan build test. Workspace itu membuka IndexedDB lokal dan menonaktifkan cloud. | `src/auth.ts:69–98`, `src/main.ts:466–469`. Hilangkan jalur ini dari artefak produksi; uji login tanpa bergantung pada bypass. Ini tidak membuktikan pembobolan RLS atau akses database akun lain, tetapi bertentangan dengan kewajiban Auth dan menimbulkan risiko akses cache lokal. |
| R02 | P0 · Kode/Risiko | **Draft cloud harus berhasil sebelum salinan lokal ditulis.** Saat jaringan gagal, edit terbaru dapat hanya berada di memori meskipun cache lokal tersedia. Menutup tab setelah kegagalan mengancam pekerjaan terbaru. | `src/storage.ts:411–418`. Pisahkan keberhasilan backup lokal dan sinkronisasi cloud, dengan antrean yang terikat akun dan revision. |
| R03 | P0 · Risiko | **Cloud commit berhasil, cache lokal gagal.** Save melanjutkan write IndexedDB setelah remote save; jika tahap lokal gagal, Studio belum menerima revision baru. Retry dapat berbenturan dengan commit milik pengguna sendiri. | `src/storage.ts:380–393`, `src/studio.ts:161–168`. Uji remote sukses + quota lokal gagal; status harus menjelaskan bagian yang sudah tersimpan dan menyediakan rekonsiliasi. |
| R04 | P0 · Kode/Risiko | **Fallback save cloud tidak menjaga perbandingan revision secara atomik.** Ketika RPC tidak tersedia, client membaca revision lalu melakukan upsert terpisah. Dua client dapat melewati pemeriksaan yang sama. | `src/cloud-driver.ts`, metode `saveChart`/`saveDraft`. Jangan menurunkan jaminan konflik secara diam-diam; kebutuhan server harus terdeteksi sebelum menyatakan operasi aman. |
| R05 | P0 · Risiko | **Dua draft pada base revision sama dapat saling menimpa.** Record draft memakai satu kunci akun/chart dan upsert; pemeriksaan base revision tidak mendeteksi edit draft lain pada revision yang sama. RPC draft juga membaca revision chart tanpa lock pada jalur itu. | `src/cloud-driver.ts:saveDraft`, `supabase/schema.sql:203–239`. Uji dua tab, dua perangkat, serta save chart bersamaan dengan autosave draft. Pertahankan salinan yang berkonflik. |
| R06 | P1 · Kode/Risiko | **Penyimpanan editor tidak memiliki tenggat aplikasi yang eksplisit untuk operasi cloud.** Timeout IndexedDB tidak membatasi penantian remote. Save/draft yang tidak selesai dapat menahan antrean dan proses keluar. | `src/studio.ts:117,142–148,159`, `src/cloud-driver.ts`. Tetapkan tenggat, pembatalan, dan rekonsiliasi hasil terlambat; jangan sekadar menganggap timeout berarti server tidak menyimpan. |
| R07 | P1 · Kode/Risiko | **Keluar akun dari Playtest/results melewati penjaga `leaveStudio()`.** `signOut()` hanya memanggil penjaga ketika `page === 'studio'`, sementara instance Studio masih dapat hidup pada halaman lain. `showAuth()` kemudian membuang referensinya. | `src/main.ts:199,208–210,437–453`. Edit belum tersimpan tetap harus dilindungi dari semua jalur keluar. Pekerjaan akun A tidak boleh tertulis ke akun B. |
| R08 | P1 · Kode | **Impor mengubah data layout tanpa pilihan eksplisit.** Parser menyetel travel time dari BPM dan melakukan snap target, meskipun data masuk memiliki nilai lain yang masih lolos validasi awal. | `src/domain.ts:parseChart`. Ini bisa merupakan kebijakan produk, tetapi harus diumumkan sebagai normalisasi/migrasi. Nilai custom tidak boleh diam-diam dianggap dipertahankan. |
| R09 | P1 · Kode/Risiko | **Konflik belum punya alur penyelesaian yang memadai.** Pesan Save failed dan saran export belum memberikan pilihan jelas untuk mempertahankan kedua versi, membuka versi terbaru, atau membuat salinan. | `src/studio.ts:147,168`, `src/storage.ts:ConflictError`. Recovery juga menawarkan restore tanpa penjelasan perbedaan base revision. Jangan menimpa versi mana pun saat menyelesaikan konflik. |

RLS dan fungsi RPC memang tersedia dalam SQL proyek. Keberadaan file tersebut belum membuktikan konfigurasi server aktif, perilaku transaksi konkuren, atau isolasi akun di deployment. Tes cloud yang tersedia memakai driver dalam memori; hasilnya tidak menggantikan uji Supabase nyata.

## 7. Ketidaknyamanan dan kualitas antarmuka

| ID | Prioritas / bukti | Temuan | Arah kebutuhan |
| --- | --- | --- | --- |
| U01 | P1 · Teramati | **Kontrol pemutaran keluar dari area pandang landscape.** Pada 844 × 390, bagian atas transport berada di y=392 dan stage di y=477. Pada 568 × 320, transport di y=411. Pengguna harus menggulir untuk menjalankan tindakan berulang. | Toolbar, Play/Pause, waktu, Undo/Redo, Save, dan akses Playtest selalu mudah dijangkau. Tinggi timeline menyesuaikan ruang yang tersedia. |
| U02 | P1 · Teramati | **Timeline dan stage bersaing secara vertikal.** Pada desktop 1440 × 1000, stage dimulai y=797 dan berakhir sekitar y=1112; tinggi halaman 1337. Pada landscape kecil, halaman 787–857 px. | Mode fokus Timeline/Stage dan panel yang dapat dilipat atau diatur ukurannya. Desktop menyediakan tampilan berdampingan jika ruang cukup. |
| U03 | P2 · Teramati/Kode | **Teks dan kontrol sangat kecil.** Label Snap terukur 7–8 px; tombol zoom sekitar 26–29 px lebar. Ini meningkatkan beban baca dan ketelitian sentuhan. | Sasaran produk: teks kontrol utama minimal 12 px, teks input 14 px, area sentuh utama 44 × 44 CSS px. Angka ini sasaran desain proyek, bukan klaim batas minimum WCAG untuk semua kontrol. |
| U04 | P1 · Kode | **Pesan privasi dan penyimpanan bertentangan.** Footer Studio menyatakan musik/chart tetap di perangkat; header menyatakan Cloud Sync; implementasi menyimpan ke Supabase untuk akun normal. | Tampilkan tujuan simpan yang sebenarnya. Status koneksi tidak boleh disamakan dengan konfirmasi bahwa perubahan terakhir sudah tersinkron. |
| U05 | P1 · Kode | **Validasi hanya menampilkan satu pesan.** Error lain dan lokasi note bermasalah tersembunyi, sehingga koreksi dilakukan dengan tebakan berulang. | Daftar masalah lengkap, jumlah error/warning, waktu/lokasi, dan tombol menuju note terkait. Warning tetap dapat diabaikan dengan sadar. |
| U06 | P2 · Kode/Kesenjangan | **Pemilihan simbol sekaligus mengubah note terpilih.** Pengguna yang hanya ingin menyiapkan simbol untuk note berikutnya dapat mengedit note lama. | Pisahkan pengaturan alat penempatan dari properti selection, atau tampilkan mode edit yang eksplisit. |
| U07 | P2 · Kesenjangan | **Alur belajar minim dan bantuan landscape disembunyikan.** Alat ikon, grid waktu, target, input side, serta entry direction memerlukan penjelasan yang mudah ditemukan. | Panduan awal singkat, legenda, daftar shortcut, tooltip yang dapat diakses keyboard/sentuh, dan contoh Dual/Hold. |
| U08 | P2 · Kode/Risiko | **Rendering terus berjalan saat editor diam.** Timeline dan stage digambar pada setiap animation frame. Ada cache kelompok note, tetapi stage tetap menyaring kelompok pada setiap frame. | Ukur biaya pada chart besar; gunakan pembaruan sesuai perubahan bila aman. Ini indikasi peluang efisiensi, belum bukti FPS rendah. |
| U09 | P1 · Arahan pengguna | **Empat lajur berdasarkan simbol menambah ruang dan perpindahan perhatian.** Pengguna menetapkan satu lajur untuk semua simbol sebagai rancangan baru; ini keputusan penyederhanaan, bukan temuan performa. | Satu lajur horizontal dengan pemilih △ ○ □ ×, penanganan kejadian bersamaan, dan Hold yang tetap mudah dipilih. FR-09. |
| U10 | P1 · Arahan pengguna | **Entry Direction berbentuk dropdown kurang langsung untuk properti spasial.** Pengguna perlu melihat dan memutar sisi spawn secara intuitif. | Wheel dengan handle, label sisi spawn, nilai sudut, dan preview lintasan. Bawah berarti spawn dari bawah. FR-10. |
| U11 | P1 · Kode/Arahan pengguna | **Inspector Type hanya menawarkan Tap/Hold**, sedangkan Dual dibuat lewat alat lain. Identitas note sebagai pasangan tidak terlihat sebagai pilihan tipe di inspector. | Pemilih Type yang konsisten pada penempatan dan selection: Tap, Hold, Dual, Dual Hold. Konversi pasangan harus aman. `src/studio.ts:192`; FR-11. |
| U12 | P1 · Arahan pengguna | **Properti banyak disajikan sebagai dropdown/form angka terpisah.** Rancangan perlu memprioritaskan pilihan yang terlihat dan manipulasi langsung sesuai jenis properti. | Tombol simbol, pilihan tipe berjajar, tombol sisi input, grid target interaktif, handle durasi, dan kontrol timing presisi. FR-11. |

## 8. Fitur penting yang belum tersedia atau belum memadai

| ID | Prioritas | Kebutuhan | Manfaat yang dituju |
| --- | --- | --- | --- |
| G01 | P1 | Pilih banyak note, seleksi rentang, copy/cut/paste, duplicate pola, geser waktu secara kelompok, dan ganti simbol melalui pemilih eksplisit. | Mengurangi pekerjaan berulang tanpa membutuhkan lajur simbol terpisah. |
| G02 | P1 | Playtest dari posisi/rentang terpilih dengan pre-roll, kembali ke konteks edit yang sama. | Menguji bagian yang sedang diperbaiki tanpa mengulang seluruh lagu. Scoring bagian uji harus jelas terpisah dari hasil run penuh. |
| G03 | P1 | Metronome yang mengikuti BPM/offset/meter, serta count-in yang dapat diatur. | Menentukan sinkronisasi grid dengan audio secara lebih terukur. |
| G04 | P2 | Loop A–B untuk preview, navigasi ke waktu/bar/beat, next/previous note, dan marker bagian lagu. | Mempercepat perpindahan dan pemeriksaan struktur chart. |
| G05 | P2 | Pembuatan Hold dengan drag dan handle resize yang jelas; perubahan panjang tetap bisa dilakukan lewat angka. | Mengurangi langkah dan memperjelas durasi sebelum commit. |
| G06 | P2 | Subdivisi triplet seperti 1/12 dan 1/24 dengan label yang menjelaskan satuan beat. | Mendukung pola ritmis yang tidak terwakili pilihan biner saat ini. |
| G07 | P2 | Waveform detail sesuai zoom, overview lagu, indikator proses, dan cache waveform yang terikat audio. | Membantu penempatan presisi tanpa menghitung ulang seluruh tampilan saat membuka editor. |
| G08 | P1 | Backup dan pemulihan yang dapat dimengerti: export chart, salinan konflik, penjelasan bahwa JSON tidak menyertakan audio. | Pengguna tahu apa yang dapat dipulihkan dan bagaimana memindahkan pekerjaan. |
| G09 | P2 | Riwayat versi tersimpan dengan pemulihan sebagai versi baru. | Memulihkan kesalahan yang ditemukan setelah Save atau membuka ulang editor. Undo saat ini hanya riwayat sesi. |
| G10 | P2 | Ringkasan kualitas chart: kepadatan, penggunaan sisi input, overlap Hold, dan lokasi pola bermasalah. | Membantu koreksi tanpa mengklaim penilaian otomatis setara kualitas musikal. |

Kalibrasi offset audio manual **sudah tersedia** pada pengaturan audio saat ini; jangan memasukkannya sebagai fitur yang sama sekali belum ada. Yang belum terbukti adalah ketepatan kalibrasi pada perangkat nyata dan pengalaman membimbing pengguna mengaturnya.

## 9. Fitur yang perlu disederhanakan atau ditunda

Tidak ada cukup bukti untuk menyatakan suatu fitur tidak relevan bagi semua pengguna. Rekomendasi berikut mengurangi gangguan dan ruang lingkup, bukan menghapus kemampuan tanpa riset.

| Elemen | Keputusan yang diusulkan | Alasan |
| --- | --- | --- |
| Lajur berdasarkan simbol | Ganti dengan satu lajur bersama; jangan menambahkan sublajur tetap untuk setiap simbol atau sisi input. | Arahan penyederhanaan pengguna. Simbol dipilih melalui tombol visual. |
| Dual Partner | Gunakan dua slot simbol visual A/B ketika Type Dual/Dual Hold dipilih atau ketika mengedit pasangan. | Pasangan dan simbolnya langsung terlihat; pengaturan tersembunyi saat tidak relevan. |
| Dropdown Entry Direction | Ganti kontrol utama dengan wheel arah spawn; pertahankan input sudut sebagai opsi presisi. | Posisi handle harus langsung menjelaskan sisi kemunculan note. |
| Travel time berbasis BPM yang readonly | Tampilkan sebagai informasi kecepatan pendekatan yang jelas, bukan seolah nilai bebas yang dapat diedit. | UI dan kebijakan parser harus menyampaikan hal yang sama. |
| Stage selalu terbuka | Jadikan panel yang dapat dilipat/diperbesar; pertahankan akses cepat. | Penting untuk target/arah, tetapi menghabiskan ruang saat menyunting timing. |
| Label dekoratif dan informasi berulang | Kurangi pada mode fokus. | Ruang editor sebaiknya digunakan untuk pekerjaan utama. |
| AI pembuat chart, beat detection otomatis, kolaborasi realtime, marketplace, Slide/Flick | P3; tidak termasuk rilis perbaikan ini. | Memerlukan kebutuhan, desain engine, atau infrastruktur tambahan dan tidak menyelesaikan masalah inti saat ini. |
| Variable BPM dan ZIP project lengkap | Backlog P2 setelah fondasi aman; rilis terpisah dengan kajian migrasi/ukuran file. | Berguna, tetapi menyentuh model data dan kompatibilitas. |

## 10. Kebutuhan produk dan kriteria penerimaan

### FR-01 — Penyimpanan yang dapat dipercaya

Menangani R02–R06, R09, dan U04.

- Setiap perubahan dokumen memperoleh backup lokal yang terikat akun dalam **maksimal 2 detik setelah edit terakhir**, pada tab aktif dan penyimpanan lokal yang berfungsi.
- Status membedakan: Belum tersimpan, Menyimpan lokal, Tersimpan di perangkat, Menunggu sinkronisasi, Tersinkron ke akun, Konflik, dan Gagal. Waktu simpan terakhir tersedia.
- Jaringan putus tidak menghalangi edit, export, atau backup lokal. Koneksi kembali memicu sinkronisasi terbatas tanpa menimpa versi lain.
- Remote save sukses + cache gagal tidak ditampilkan sebagai kegagalan total tanpa penjelasan. Revision remote dapat ditemukan kembali dan direkonsiliasi.
- Tenggat operasi cloud ditetapkan **15 detik** sebagai sasaran awal; pengguna tetap dapat melanjutkan edit/export. Hasil server yang terlambat harus direkonsiliasi sebelum retry menulis.
- Dua tab/perangkat tidak dapat menimpa saved chart atau draft satu sama lain tanpa konflik yang terlihat. Tersedia “Simpan sebagai salinan”, “Buka versi terbaru”, dan export versi lokal.
- Semua skenario di atas diuji dengan injeksi kegagalan serta dua akun Supabase uji. Tidak ada audio/chart uji yang dipindahkan ke akun pengguna.

### FR-02 — Perlindungan pekerjaan pada seluruh navigasi

Menangani R01, R07, dan B09.

- Artefak produksi tidak membuka workspace melalui penanda localStorage, webdriver, atau identitas pengguna uji. Pengujian memakai mekanisme khusus yang terpisah dari produk produksi.
- Berpindah halaman, keluar akun, mengganti akun, refresh, keluar dari Playtest, serta menutup results mengikuti kebijakan perlindungan pekerjaan yang sama ketika instance editor masih memiliki edit.
- Input form yang terlihat sudah masuk state edit/backup; tidak perlu blur untuk mulai melindunginya. Input angka sementara seperti kosong atau tanda minus tidak merusak chart.
- Ctrl/Cmd+S bekerja dari field metadata setelah validasi input, tanpa mengambil alih perilaku pengetikan biasa untuk shortcut lain.
- Data tertunda milik akun A tidak pernah tersinkron sebagai data akun B. Saat sesi berakhir, salinan lokal aman dan jalur masuk ulang/pemulihan dijelaskan.

### FR-03 — Dual dan manipulasi note konsisten

Menangani B01–B04, B08, B10, dan G01.

- Pasangan Dual memiliki identitas logis; grouping visual tidak menentukan anggota operasi edit.
- Delete/Eraser, Duplicate, pindah waktu, resize Dual Hold, dan undo/redo memiliki perilaku pasangan yang sama untuk matching maupun mixed-symbol Dual.
- Duplicate menghasilkan pasangan baru dengan identitas baru, mempertahankan sisi dan selisih waktu/durasi yang memang sah.
- Pengguna dapat memilih “Edit anggota” atau “Pisahkan pasangan” secara eksplisit. Perubahan simbol satu anggota tidak menghapus identitas pasangan tanpa tindakan tersebut.
- Toolbar simbol menyiapkan penempatan berikutnya; perubahan selection dilakukan melalui properti yang jelas.
- N hanya menempatkan note pada alat penempatan. Pada Eraser/Select/Pan, tindakan tidak membuat note dan memberi petunjuk bila perlu.
- Multi-select dan clipboard mempertahankan hubungan pasangan. Satu operasi kelompok menjadi satu langkah undo.
- Uji regresi mencakup pasangan dengan simbol sama/berbeda, target sama/berbeda, kedua urutan ID, serta batas awal/akhir audio.
- Pemilih Type pada toolbar dan inspector sama-sama menampilkan Tap, Hold, Dual, dan Dual Hold. Pemilihan Dual dikenali sebagai pasangan, bukan hanya perubahan gaya ikon. Rincian konversi mengikuti FR-11.

### FR-04 — Gesture dan kondisi editor stabil

Menangani B05–B07, B12, dan U06.

- Klik kosong pada stage tidak memindahkan target lama. Perpindahan hanya dimulai dari target/handle yang jelas atau mode penempatan eksplisit.
- Drag, perubahan angka, batal melalui Escape/pointercancel/lost capture memiliki hasil konsisten. Batal tidak menambah langkah undo.
- Kembali dari Playtest mempertahankan zoom, scroll, playhead edit, selection, panel, Snap, Follow, dan alat. Indikator selalu membaca state yang sama dengan perilaku aktual.
- Seek/Pan/Scrub yang mematikan Follow langsung memperbarui indikator.
- Saat chart diganti, state yang dipertahankan dan yang direset ditentukan eksplisit; selection lama tidak menunjuk note dari chart lain.

### FR-05 — Ruang kerja responsif dan mudah dibaca

Menangani U01–U03 dan U07.

- Pada 1440 × 1000, 1280 × 720, 844 × 390, 667 × 375, dan 568 × 320, tersedia akses tetap ke Play/Pause, waktu, Undo/Redo, Save, serta Playtest tanpa menggulir halaman utama. Overflow menu boleh digunakan untuk aksi sekunder.
- Timeline mengambil tinggi sisa layar; layout tidak bergantung hanya pada tinggi canvas tetap.
- Seluruh simbol berada pada satu lajur note sesuai FR-09. Penghematan ruang dipakai untuk keterbacaan, stage, dan kontrol yang nyaman; jangan menggantinya dengan panel dekoratif atau sublajur baru.
- Stage dan inspector dapat dilipat atau diperbesar. Pada layar pendek, panel besar tidak mendorong kontrol utama keluar layar.
- Memperbesar teks/zoom browser sampai 200% tidak menghilangkan akses ke aksi utama. Panel boleh bergulir secara terarah.
- Sasaran keterbacaan dan area sentuh pada U03 diverifikasi dengan pengukuran layout dan uji pengguna. Jangan mengecilkan label ke 5–8 px untuk memaksakan semua panel tampil.
- Pengguna baru dapat membuat satu Tap, satu Hold, dan satu Dual serta menjalankan Playtest dalam **5 menit**, pada uji awal minimal 5 peserta; minimal 4 berhasil tanpa bantuan fasilitator. Ini target validasi, belum hasil aktual.

### FR-06 — Timing, preview, dan Playtest untuk koreksi cepat

Menangani G02–G06.

- Grid offset, kalibrasi output/input perangkat, dan waktu note dijelaskan sebagai tiga konsep berbeda. Mengubah grid tidak memindahkan note.
- Metronome memakai jadwal audio yang sama dengan transport, mengikuti BPM/meter/offset, dan tidak menggandakan suara setelah pause/seek/resume.
- Pengguna dapat memilih awal/rentang uji, pre-roll **0–4 beat**, serta loop preview A–B. Batas loop dan perilaku Hold yang melintasi awal rentang ditentukan dan diuji.
- Pengujian dari tengah memakai engine yang sama; note sebelum rentang tidak dihitung Miss. Hasil bagian uji tidak masuk session history atau leaderboard run penuh.
- Kembali ke editor memulihkan posisi edit sebelum uji. Tidak wajib mendengarkan lagu dari awal setiap kali memperbaiki bagian akhir.
- Penambahan triplet tidak mengubah timestamp note yang sudah ada.

### FR-07 — Validasi, kompatibilitas, dan backup

Menangani U05, R08–R09, G08–G10.

- Daftar validasi menampilkan seluruh masalah dengan severity, waktu, note/pasangan terkait, penjelasan, dan navigasi satu tindakan.
- Error gameplay memblokir Playtest dengan alasan yang jelas; Save/backup pekerjaan yang belum lengkap tetap tersedia selama struktur data aman.
- Pesan padat kurang dari 100 ms adalah warning, bukan penilaian bahwa chart pasti buruk atau mustahil.
- Impor melaporkan field yang akan dinormalisasi dan menyediakan pratinjau/perbandingan; file sumber tidak ditimpa.
- Export/impor mempertahankan semua field yang dinyatakan didukung. Perubahan kebijakan travel/target memiliki versi dan catatan migrasi yang jelas.
- Sebelum export pengguna tahu apakah audio disertakan. Sebelum relink audio pengguna tahu chart mana yang menjadi di luar durasi.
- Pemulihan versi menghasilkan versi/salinan baru dan tidak menghapus versi yang sedang tersimpan.

### FR-08 — Aksesibilitas dan efisiensi

Menangani B11, U03, dan U08.

- Pengguna keyboard dapat menemukan, memilih, menambah, memindah, dan menghapus note melalui daftar/properti yang dapat diakses; canvas bukan satu-satunya jalur selection.
- Tombol toggle mengumumkan state; tombol Play/Pause mengumumkan tindakan saat ini; status simpan mengumumkan perubahan tanpa membanjiri pengguna setiap frame.
- Operasi drag memiliki alternatif klik/properti yang dapat digunakan tanpa drag. Fokus terlihat dan tidak tertutup panel.
- Target kepatuhan: WCAG 2.2 AA pada alur editor yang relevan, termasuk keyboard, fokus, kontras, status, dan alternatif drag. Ukuran target mengikuti SC 2.5.8 beserta pengecualiannya; sasaran sentuh proyek yang lebih nyaman tetap 44 px.
- Ukur chart 2.000 dan 10.000 note, audio sampai 10 menit dalam batas PCM, serta 20 siklus buka editor–Playtest–kembali. Tidak boleh ada penambahan listener/source/proses yang tertinggal setelah ditutup.
- Sasaran awal pada perangkat rujukan yang dicatat: respons edit p95 ≤100 ms dan waktu frame p95 ≤20 ms ketika preview berjalan. Perangkat, browser, dataset, dan cara pengukuran wajib dicantumkan; tidak boleh mengklaim 60 FPS seluruh perangkat dari emulasi desktop.
- Kondisi editor diam tidak perlu menggambar ulang terus-menerus tanpa perubahan visual; optimasi dilakukan berdasarkan pengukuran, tanpa mengorbankan akurasi audio.

### FR-09 — Timeline satu lajur untuk semua simbol

**Prioritas: P1, wajib pada rancangan editor baru.** Menangani U09 dan mendukung G01 serta FR-03–FR-05.

#### Tata letak dan arti lajur

- Hanya ada **satu lajur penempatan note horizontal**. Segitiga, lingkaran, persegi, dan kali berada pada garis tengah lajur yang sama, berurutan menurut waktu.
- Ruler bar/beat, waveform, marker, dan transport boleh tampil di area terpisah, tetapi bukan lajur note tambahan. Tidak ada lajur khusus simbol, Left/Right, Tap/Hold, atau anggota Dual.
- Bentuk △ ○ □ × menjadi pembeda utama; warna hanya membantu. Selection, tipe Hold, dan pasangan Dual memiliki penanda yang tetap terbaca tanpa bergantung pada warna.
- Tombol simbol dan Type aktif terlihat dekat timeline. Saat menempatkan note, preview di pointer menunjukkan simbol, tipe, dan waktu hasil snap sebelum commit.
- Klik/tap ruang kosong pada mode Place menambahkan simbol/tipe aktif. Pada Select, klik kosong membersihkan selection; pada Eraser hanya menghapus objek yang dituju. Semua perilaku mengikuti mode yang terlihat.
- Drag note secara horizontal hanya mengubah waktu. Gerakan vertikal tidak mengganti simbol, target panggung, tipe, atau sisi input. Mengubah target panggung dilakukan di stage/properti.

#### Note bersamaan dan tumpang tindih

- Dua note dengan waktu sama tidak boleh saling menutupi hingga salah satunya tidak dapat diakses. Tampilkan satu penanda kejadian pada waktu yang tepat dengan susunan simbol ringkas atau badge jumlah.
- Matching Dual ditampilkan sebagai satu unit pasangan dengan penanda dua input; mixed-symbol Dual memperlihatkan kedua simbol. Semua tetap berada dalam lajur yang sama.
- Klik/tap penanda gabungan memilih pasangan logis bila memang Dual. Jika beberapa objek berbeda bertumpuk, buka popover lokal berisi daftar simbol, tipe, waktu, dan sisi input agar pengguna memilih objek yang tepat.
- Popover dapat dinavigasi keyboard dan ditutup dengan Escape. Ia bersifat sementara, bukan lajur tambahan atau syarat untuk mengedit note tunggal yang tidak bertumpuk.
- Dua objek yang sekadar berdekatan pada zoom kecil **tidak otomatis menjadi Dual**. Bedakan badge kepadatan dari penanda pasangan. Memperbesar zoom menguraikan kepadatan tanpa mengubah data.
- Jangan menggeser timestamp atau memberi offset visual horizontal palsu agar note terlihat terpisah. Posisi penanda waktu selalu akurat; detail simbol boleh ditempatkan di dalam penanda/popover.
- Hold tampil sebagai rentang waktu pada lajur yang sama, dengan kepala, ujung, dan handle yang jelas. Tap di dalam rentang Hold serta beberapa rentang Hold tetap dapat dipilih; hit testing tidak selalu mengambil Hold teratas.
- Pola yang tidak playable tetap dapat diperiksa dan disimpan sebagai draft, dengan indikator validasi. Satu lajur tidak membuat batas gameplay dua input menjadi satu input.

#### Kriteria penerimaan

1. Tempatkan △, ○, □, dan × pada empat waktu berbeda: semuanya tampil pada satu garis tengah lajur dan dapat dipilih secara terpisah.
2. Ganti simbol note melalui tombol simbol di inspector: hanya simbol yang berubah. Drag vertikal tidak mengubah simbol.
3. Matching Dual, mixed-symbol Dual, dua Tap simultan, Tap di atas rentang Hold, serta dua Hold overlap dapat dipilih, diubah, dan dihapus secara tepat pada desktop maupun sentuh.
4. Pada zoom rendah, badge kepadatan dapat dibuka atau diperbesar; tidak ada note yang hilang dari daftar selection dan tidak ada pasangan baru yang dibuat otomatis.
5. Pindah waktu, snap, resize Hold, marquee/rentang selection, dan clipboard tetap akurat dengan undo/redo satu langkah per tindakan.
6. Membuka lalu menyimpan chart lama melalui satu lajur mempertahankan waktu, simbol, sisi input, hubungan pasangan, target, dan arah sesuai kebijakan kompatibilitas FR-07. Penyederhanaan lajur sendiri tidak memicu normalisasi atau migrasi data.
7. Seluruh viewport FR-05 tetap menggunakan satu lajur. Tidak ada pengguliran vertikal antarjalur simbol.

### FR-10 — Entry Direction berupa wheel arah spawn

**Prioritas: P1, wajib pada rancangan editor baru.** Menangani U10, B05, serta kebutuhan manipulasi target yang mudah dipahami.

#### Tampilan dan interaksi

- Gunakan label utama **“Arah spawn”**, dengan keterangan singkat “Sisi tempat note muncul sebelum menuju target”. Istilah Entry Direction boleh ditampilkan sebagai istilah pendamping.
- Wheel menampilkan target di tengah, lingkaran kontrol, penanda atas/kanan/bawah/kiri, dan handle pada keliling. Pengguna memutar handle atau klik/tap titik di keliling untuk menentukan arah.
- **Handle di bawah berarti spawn dari bawah lalu bergerak ke target.** Handle di atas/kanan/kiri berarti spawn dari sisi tersebut. Arah tidak dibalik menjadi arah perjalanan keluar dari target.
- Gunakan konvensi yang sesuai model saat ini: kanan **0°**, bawah **90°**, kiri **180°**, atas **270°**; sudut bertambah searah jarum jam. Diagonal utama adalah 45°, 135°, 225°, dan 315°.
- Garis dari pusat ke handle menunjukkan **sisi spawn**. Preview gerak terpisah menunjukkan note bergerak **dari tepi ke target**, sehingga panah dekoratif tidak menimbulkan arti yang terbalik.
- Tampilkan label langsung seperti **“Bawah · 90°”** di dekat wheel. Sediakan input sudut presisi dan tombol delapan arah untuk pilihan tanpa drag.
- Snap wheel default ke delapan arah utama, setiap 45°. Toggle **“Sudut bebas”** mengizinkan arah lain dengan input presisi sampai 0,1°; nilai ditampilkan dan disimpan sesuai presisi yang disepakati.
- Chart yang sudah memiliki sudut custom membuka wheel pada nilai aslinya. Membuka panel atau menyalakan snap tidak langsung membulatkan nilai; snap berlaku ketika pengguna melakukan perubahan.
- Memutar melewati batas 359°/0° tidak membalik arah atau meloncat ke sisi berlawanan. Sudut dinormalisasi dalam rentang 0° hingga kurang dari 360°.
- Preview stage diperbarui selama interaksi, memakai geometri lintasan yang sama dengan gameplay. Untuk target yang tidak di tengah, sisi spawn ditentukan dari arah terhadap target dan tepi stage yang sebenarnya, bukan posisi tengah wheel secara keliru.
- Perubahan arah tidak mengubah waktu hit, durasi Hold, simbol, posisi target, atau travel time. Perubahan pada pasangan mengikuti mode “Pasangan” atau “Edit anggota” yang terlihat.
- Satu putaran/drag selesai menjadi satu langkah undo. Escape, pointercancel, atau kehilangan capture mengembalikan nilai awal; klik delapan arah dan input angka juga dapat di-undo.

#### Kriteria penerimaan

| Tindakan | Hasil yang wajib terlihat |
| --- | --- |
| Handle dipindahkan ke bawah | Label Bawah · 90°; preview muncul dari tepi bawah menuju target. |
| Handle dipindahkan ke kanan/kiri/atas | Label dan preview masing-masing sesuai 0°/180°/270°. |
| Pilih diagonal kanan bawah | Label 45° dan preview berasal dari arah kanan bawah. |
| Masukkan 22,5° pada mode sudut bebas | Wheel dan preview mengikuti 22,5°; save/reopen mempertahankannya. |
| Putar melintasi 0° lalu batalkan | Tidak ada lompatan arah; nilai awal kembali dan history tidak bertambah. |
| Atur arah pada target dekat tepi stage | Lintasan preview dan Playtest cocok; indikator sisi tidak terbalik. |
| Ubah arah pasangan lalu undo | Kedua anggota yang menjadi cakupan edit kembali tepat ke nilai sebelumnya. |

Wheel dapat dipakai dengan mouse, sentuh, keyboard, atau tombol arah preset. Handle/tombol utama mengikuti sasaran area sentuh 44 px; indikator visual dapat lebih kecil daripada area tangkapnya. Fokus, label nilai, dan state harus dapat dibaca teknologi bantu.

### FR-11 — Type termasuk Dual dan kontrol properti yang lebih langsung

**Prioritas: P1 untuk Type, pemilih simbol, dan kontrol visual inti.** Menangani U11–U12, U06–U07, serta B01–B04. Detail fitur lanjutan tetap mengikuti prioritas G01–G10.

#### Pilihan Type yang konsisten

Tampilkan empat tombol pilihan dengan ikon, label, dan state aktif: **Tap | Hold | Dual | Dual Hold**. Pemilih yang sama digunakan untuk calon note baru dan selection; judul panel membedakan **“Penempatan baru”** dari **“Note terpilih”** agar pengguna tahu apa yang akan berubah.

| Type | Isi dan properti yang terlihat |
| --- | --- |
| Tap | Satu simbol, satu waktu hit, pilihan sisi input jika dibutuhkan. |
| Hold | Satu simbol, waktu mulai dan durasi/akhir, handle panjang Hold. |
| Dual | Dua slot simbol A/B, satu waktu hit bersama, penanda pasangan dan dua input. |
| Dual Hold | Dua slot simbol A/B, satu waktu mulai bersama, durasi Hold bersama secara default, dua input. |

- Memilih Dual langsung membuka dua slot simbol visual; pengguna tidak perlu menemukan Dual melalui dropdown sisi input atau tombol tool lain. Default pasangan baru memakai simbol utama yang sama pada A/B dengan Left/Right yang jelas; simbol B dapat diganti sebelum atau setelah penempatan.
- Matching Dual mengharuskan input Left dan Right yang berbeda. Mixed-symbol Dual tetap menggunakan dua input; pemilih sisi dan validator mencegah dua anggota membutuhkan input yang sama secara bersamaan.
- Waktu bersama dan properti pasangan ditampilkan satu kali pada mode Pasangan. Properti per anggota tersedia lewat pilihan A/B dan label **“Edit anggota”**; pengeditan anggota tidak memisahkan pasangan secara diam-diam.
- Data lama yang tidak sesuai satu preset ditampilkan sebagai **“Campuran/perlu ditinjau”**, dengan properti asli tetap terlihat. Jangan memaksa Hold campuran, sudut berbeda, atau pasangan lama menjadi preset baru hanya karena inspector dibuka.
- Multi-select dengan Type berbeda menampilkan state Campuran, bukan mengaku semua objek Tap. Pengguna meninjau dampak sebelum mengonversi beberapa objek.

#### Aturan konversi yang melindungi pekerjaan

| Konversi | Perilaku yang diwajibkan |
| --- | --- |
| Tap ↔ Hold | Pertahankan simbol, waktu, target, arah, dan sisi. Saat menjadi Hold, preview durasi awal satu beat atau ruang tersisa sebelum akhir audio; pengguna dapat mengubahnya. Menjadi Tap menghapus durasi secara eksplisit dan dapat di-undo. |
| Tap/Hold → Dual/Dual Hold | Tambahkan anggota B dengan waktu dan tipe sesuai preset. Tampilkan hasil pasangan, sisi input, serta properti yang akan berubah sebelum commit; anggota awal dipertahankan sejauh kompatibel. |
| Dual ↔ Dual Hold | Pertahankan kedua simbol, identitas pasangan, waktu, target, dan arah; tampilkan perubahan durasi. Hold awal tidak boleh melampaui audio. |
| Dual/Dual Hold → Tap/Hold | Tanyakan anggota A atau B yang dipertahankan; jangan menghapus anggota diam-diam. Preview anggota yang dilepas dan sediakan Batal. |
| Konversi menghasilkan konflik/batas audio | Jelaskan lokasi/penyebab; jangan menggeser waktu atau menghapus note lain otomatis. Tawarkan ubah parameter atau Batal. |

Setiap konversi selesai merupakan satu langkah undo/redo, termasuk perubahan seluruh anggota. Klik Type yang sudah aktif tidak menciptakan note atau mengubah data. Membuka pemilih Type tidak langsung melakukan konversi.

#### Bentuk kontrol untuk properti lain

| Properti/aksi | Kontrol utama yang diusulkan | Alternatif presisi dan perlindungan |
| --- | --- | --- |
| Simbol | Empat tombol besar △ ○ □ × dengan label nama; pada Dual tersedia slot A/B. | Pilihan keyboard dan status aktif yang jelas. Tombol placement tidak mengubah selection lama. |
| Type | Empat tombol Tap, Hold, Dual, Dual Hold. | Label teks, bukan ikon saja; konversi mengikuti aturan di atas. |
| Arah spawn | Wheel, handle, preset delapan arah, dan preview lintasan. | Input derajat serta mode sudut bebas sesuai FR-10. |
| Posisi target | Drag handle target pada grid stage, indikator koordinat, dan tombol pusatkan. | X/Y dengan stepper; tombol panah untuk nudge. Klik kosong tidak memindahkan selection. |
| Waktu note | Drag horizontal dengan preview waktu/bar/beat dan garis snap. | Input waktu, next/previous snap, dan aksi geser ±satu langkah snap. |
| Durasi Hold | Handle ujung dan preview panjang/rentang waktu. | Pilihan cepat ½, 1, 2, 4 beat serta input durasi/akhir; batas audio selalu terlihat. |
| Sisi input | Tombol berjajar Either, Left, Right; anggota Dual ditandai A/B. | Label penuh dan penjelasan konflik; pilihan yang tidak sah tidak diterapkan diam-diam. |
| BPM | Stepper −/+, Tap BPM dengan indikator jumlah tap, dan angka yang bisa diketik. | Presisi desimal dipertahankan; input angka tetap cara utama yang sah untuk nilai pasti. |
| Offset grid | Geser marker beat nol dengan preview grid, tombol nudge, dan label ms. | Input ms bertanda positif/negatif, reset dengan undo. Audio/note tidak ikut bergeser. |
| Snap | Toggle jelas dan pilihan pecahan yang terlihat untuk nilai umum. | Pilihan tambahan melalui popover jika ruang sempit; perubahan snap tidak memindahkan note yang sudah ada. |
| Meter dan difficulty | Pilihan berjajar/chip berlabel untuk opsi yang sedikit. | Keyboard dan popover pada layar sempit; tidak menambah langkah pada aksi yang sering dipakai. |
| Zoom/navigasi | Slider zoom, −/+, Fit chart, dan Focus selection; overview waktu. | Nilai zoom ditampilkan; zoom berpusat di playhead/selection sesuai tindakan dan tidak mengubah timestamp. |
| Loop dan pre-roll | Handle A–B pada ruler, toggle Loop, dan pilihan pre-roll berlabel beat. | Input batas/waktu dan reset; status loop terlihat sebelum Play. |
| Save/Playtest | Tombol utama berlabel dan status simpan dekat tindakan. | Tetap terjangkau sesuai FR-05; aksi sekunder tidak menggeser kontrol utama. |

Dropdown tetap boleh digunakan untuk daftar panjang seperti pemilihan chart atau opsi lanjutan. Sasaran perubahan adalah mengurangi pencarian dan meningkatkan kejelasan, bukan mengganti setiap field angka dengan slider/wheel. Pada layar sempit, kontrol sekunder dapat masuk bottom sheet yang tetap memperlihatkan selection dan preview; panel tidak boleh menutup transport atau tombol selesai/batal.

#### Kriteria penerimaan UI/UX

1. Pengguna dapat memilih seluruh simbol dan keempat Type tanpa membuka dropdown pada layout desktop; pada landscape kecil, satu panel penempatan menampilkan semua pilihan tersebut dengan label yang terbaca.
2. Setiap perubahan menampilkan cakupan: calon note baru, note terpilih, pasangan, anggota A/B, atau multi-selection. Tidak ada perubahan selection hanya karena menyiapkan alat berikutnya.
3. Parameter tidak relevan disembunyikan: durasi hanya untuk Hold, slot B untuk Dual, dan opsi anggota ketika pasangan dipilih. Nilai yang sedang dipakai tetap mudah ditemukan.
4. Drag/putar/slider memberi preview sebelum commit, satu langkah undo per gesture, dan pembatalan tanpa perubahan tersisa. Klik/tap preset langsung menampilkan hasil yang sama dengan input presisi ekuivalen.
5. Pada uji kegunaan minimal 5 peserta, setidaknya 4 dapat membuat pola empat simbol di satu lajur, membuat Dual, dan mengatur spawn dari bawah dalam 3 menit setelah editor siap, tanpa bantuan fasilitator. Target ini melengkapi tugas 5 menit FR-05 dan belum diuji.
6. Pengujian mencakup pengguna mouse, sentuh, dan keyboard; tidak ada kontrol yang hanya bekerja dengan hover atau gesture putar presisi.

## 11. Bentuk pengalaman yang disarankan

1. **Buka chart:** tampilkan nama lagu/chart, status simpan aktual, dan tindakan lanjutkan draft jika ada. Draft lama/berkonflik tidak langsung menggantikan saved chart.
2. **Atur timing:** pengguna dapat mendengar metronome, melihat grid, dan memahami dampak perubahan BPM/offset.
3. **Pilih dan tempatkan:** pilih △/○/□/× dan Tap/Hold/Dual/Dual Hold, lalu klik waktu pada satu lajur. Toolbar menyiapkan penempatan baru; inspector mengubah selection yang cakupannya terlihat.
4. **Atur gerak:** geser target di stage dan putar wheel Arah spawn. Handle bawah menghasilkan preview note dari bawah menuju target. Nilai presisi tersedia tanpa mewajibkan dropdown.
5. **Koreksi:** panel masalah menunjuk lokasi yang perlu diperbaiki. Multi-select, daftar objek bertumpuk, dan clipboard mempercepat pola berulang.
6. **Uji bagian:** pilih rentang, jalankan dengan pre-roll, lalu kembali ke posisi edit semula.
7. **Simpan atau keluar:** pengguna tahu apa yang sudah aman secara lokal, apa yang sudah di akun, dan apa yang masih memerlukan tindakan.

Desktop menyediakan toolbar aksi di atas, pemilih simbol/Type dekat timeline satu lajur, stage yang dapat diatur, dan inspector kontekstual dengan wheel. Landscape kecil menggunakan tab Timeline/Stage/Properties dengan transport tetap terlihat dan akses cepat ke pemilih penempatan. Satu lajur, wheel arah spawn, dan Type termasuk Dual adalah kebutuhan produk yang sudah ditetapkan; ukuran panel dan susunan detail tetap perlu validasi desain sebelum implementasi.

## 12. Urutan pekerjaan yang disarankan

| Tahap | Cakupan | Syarat selesai |
| --- | --- | --- |
| **A — Keamanan pekerjaan** | R01–R07, R09, B09; FR-01 dan FR-02. | Auth produksi wajib; skenario offline, konflik, remote/lokal gagal sebagian, dan perpindahan akun lulus. |
| **B — Ketepatan editor** | B01–B08, B10–B12, R08; FR-03, FR-04, bagian FR-07 dan konversi FR-11. | Operasi Dual/gesture konsisten; Type dan konversi aman; state benar setelah Playtest; kompatibilitas impor jelas. |
| **C — Penyederhanaan dan kenyamanan inti** | U01–U07, U09–U12, G01–G03; FR-05, FR-09, FR-10, kontrol inti FR-11, bagian FR-06 dan FR-08. | Satu lajur seluruh simbol, wheel arah spawn, dan Type Dual tersedia; kontrol utama terjangkau; uji tugas pengguna dan aksesibilitas inti lulus. |
| **D — Produktivitas lanjutan** | G04–G10, pengukuran U08; penyelesaian FR-06–FR-08. | Manfaat waktu kerja dan performa diukur; fitur kompleks tidak menghambat fondasi. |

Tahap dapat dikembangkan terpisah setelah persetujuan. Tidak ada estimasi hari yang dipaksakan sebelum rancangan penyimpanan, kondisi backend aktif, dan desain UI dikonfirmasi.

## 13. Matriks verifikasi rilis

| Skenario | Verifikasi yang diwajibkan |
| --- | --- |
| Tap, Hold, matching Dual, mixed-symbol Dual | Place, select, move, resize, symbol, side, duplicate, delete, erase, undo/redo, save/reopen. |
| Satu lajur | Empat simbol pada garis tengah sama; simultan, badge kepadatan, Hold overlap, pemilih objek, seluruh zoom dan viewport; chart lama tidak berubah saat hanya berganti tampilan. |
| Wheel arah spawn | Empat arah utama, empat diagonal, sudut bebas 22,5°, batas 359°/0°, target tepi, preview versus Playtest, batal gesture, keyboard/sentuh, save/reopen. |
| Type dan kontrol visual | Tap/Hold/Dual/Dual Hold pada placement/inspector; seluruh konversi A/B, multi-selection Campuran, data lama nonpreset, undo/redo, unit waktu/beat/ms. |
| Draft dan saved chart | Reload, crash simulasi, restore chart baru/lama, dua tab, dua perangkat, konflik revision sama dan berbeda. |
| Kegagalan sebagian | Offline, koneksi terputus saat save, server terlambat, remote sukses/lokal gagal, quota lokal habis, session expired. |
| Navigasi | Library, import, Playtest, results, keluar akun, ganti akun, refresh, close tab ketika form masih fokus. |
| Timing | BPM rendah/tinggi, offset positif/negatif, 3/4 dan 4/4, biner/triplet, Hold pada batas audio/rentang uji. |
| Responsif | Desktop dan seluruh viewport FR-05; keyboard terbuka pada mobile; perubahan orientasi; zoom teks/browser. |
| Aksesibilitas | Keyboard tanpa mouse, pembaca layar pada kontrol/form/status/daftar note, fokus, alternatif drag, kontras terukur. |
| Browser/perangkat | Chrome dan Firefox desktop; Safari macOS/iPhone fisik; Chrome Android fisik; versi dicatat saat pengujian. |
| Cloud dan keamanan | Login nyata, dua akun uji, RLS database dan Storage, tidak ada bypass produksi, tidak ada antrean lintas akun. |
| Performa | Chart 2.000/10.000 note, audio panjang dalam batas, profiling frame/respons/memori, 20 siklus lifecycle. |

Setelah implementasi kelak, jalankan `npm test` dan `npm run build`, lalu tes browser serta perangkat yang relevan. Tes baru harus memeriksa perilaku dan kegagalan nyata, bukan hanya menyalin struktur implementasi.

## 14. Kriteria siap rilis

- Semua P0 selesai atau terbukti tidak terjadi melalui pengujian yang terdokumentasi.
- Tidak ada P1 terbuka pada penyimpanan, operasi note/Dual, pemulihan, atau akses kontrol inti untuk cakupan rilis.
- Rilis penyederhanaan editor memenuhi FR-09–FR-11: satu lajur bersama, wheel dengan sisi spawn yang benar, pilihan Type termasuk Dual, dan kontrol visual yang memiliki alternatif presisi.
- Matriks regresi tahap yang dirilis lulus; setiap batas dukungan browser/perangkat dinyatakan secara jujur.
- Tidak ada perubahan chart pengguna secara diam-diam; migrasi memiliki penjelasan dan jalur backup.
- Hasil unit, build, browser, perangkat, dan pengujian cloud dicatat terpisah.
- Pemilik produk menyetujui perilaku Dual, status penyimpanan, kebijakan normalisasi impor, dan cakupan perangkat. Dokumen ini sendiri bukan persetujuan implementasi.

## 15. Keputusan produk dan rincian yang masih perlu divalidasi

Arahan pengguna sudah menjadi kebutuhan tetap dalam dokumen. Tabel berikut memisahkan keputusan tersebut dari rincian desain dan rekomendasi yang masih perlu divalidasi:

| Keputusan | Status dan arah |
| --- | --- |
| Jumlah lajur note | **Ditetapkan pengguna:** satu lajur untuk △ ○ □ ×, termasuk Hold dan pasangan Dual. |
| Entry Direction | **Ditetapkan pengguna:** wheel yang diputar; sisi handle sesuai sisi spawn. Konvensi sudut dan interaksi rinci ditentukan FR-10 untuk divalidasi. |
| Pilihan Type | **Ditetapkan pengguna:** Dual tersedia sebagai pilihan tipe. PRD menggunakan Tap, Hold, Dual, Dual Hold dengan konversi aman. |
| Kontrol properti | **Ditetapkan pengguna:** tingkatkan kenyamanan dengan kontrol visual yang sesuai, tidak mengandalkan dropdown saja. Pemetaan rinci pada FR-11. |
| Unit selection Dual | Rekomendasi: pasangan sebagai default; anggota dapat diedit melalui mode eksplisit. |
| Draft offline | Rekomendasi: backup lokal lebih dahulu dengan identitas akun; sinkronisasi terpisah dan sadar konflik. |
| Travel time | Rekomendasi: pertahankan kebijakan berbasis BPM untuk rilis inti; jelaskan normalisasi impor. Evaluasi nilai custom sebagai fitur terpisah. |
| Layar pendek | Validasi susunan tab/bottom sheet, ukuran wheel, serta penanganan note bertumpuk dengan pengguna sentuh. Satu lajur dan transport terjangkau tetap wajib. |
| Prioritas fitur | Penyimpanan dan ketepatan dahulu; penyederhanaan satu lajur, wheel, dan Type menjadi cakupan inti tahap C bersama alat produktivitas yang ditetapkan. |
| Ukuran keberhasilan | Integritas data, keberhasilan tugas pengguna, akses kontrol, ketepatan arah, serta respons editor yang terukur. |

## 16. Sumber dan catatan bukti

Sumber utama audit adalah kode pada baseline di awal dokumen: `src/studio.ts`, `src/domain.ts`, `src/stage.ts`, `src/main.ts`, `src/audio.ts`, `src/play.ts`, `src/storage.ts`, `src/cloud-driver.ts`, `src/auth.ts`, `src/style.css`, `supabase/schema.sql`, serta pengujian dalam `tests/`. Nomor baris merujuk baseline tersebut dan dapat bergeser setelah implementasi.

Rujukan aksesibilitas: [WCAG 2.2 — W3C](https://www.w3.org/TR/WCAG22/) dan [penjelasan alternatif dragging — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). Rujukan ini dipakai untuk menentukan kebutuhan dan prosedur pemeriksaan; belum dilakukan audit kepatuhan lengkap.

Dokumen proyek `README.md`, `docs/STATUS.md`, dan `docs/MANUAL_QA.md` mengandung sebagian keterangan historis yang berbeda dengan implementasi cloud/audio saat ini. Kode dan hasil audit baru menjadi dasar temuan; pembaruan dokumentasi produk perlu mengikuti perubahan kelak.

Revisi 0.2 menambahkan kebutuhan produk dari pengguna pada U09–U12 dan FR-09–FR-11, serta menyelaraskan alur, tahapan, dan matriks verifikasi. Revisi ini tidak mengubah bukti audit awal menjadi klaim bahwa UI baru sudah tersedia atau teruji.

**Status dokumen:** kebutuhan PRD tetap menjadi acuan. Implementasi UI inti sudah berjalan atas instruksi pengguna; lihat [checkpoint editor](EDITOR_IMPLEMENTATION.md) untuk kemampuan yang tersedia, hasil pemeriksaan, dan backlog yang belum selesai. Bukti audit awal tidak dianggap sebagai bukti penyelesaian semua kebutuhan.
