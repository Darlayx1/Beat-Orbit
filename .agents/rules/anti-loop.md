---
trigger: always_on
description: "Prevent repetitive debugging, infinite loops, unnecessary tool calls, and inefficient token usage."
---

# Anti-Loop, Anti-Repetition, and Efficient Debugging

## A. Iteration Control
- Maksimal 3 percobaan untuk setiap masalah.
- Jika 2 percobaan menghasilkan kegagalan yang sama, hentikan perubahan kode dan lakukan root cause analysis.
- Dilarang mengulang solusi identik tanpa hipotesis atau bukti baru.
- Setelah 3 percobaan gagal, hentikan proses pada masalah tersebut dan laporkan kendalanya.

## B. Intelligent Debugging
- Identifikasi penyebab utama sebelum mengubah kode.
- Periksa log, konfigurasi, dependency, dan file terkait.
- Prioritaskan perubahan kecil yang dapat diuji secara terpisah.
- Hindari perubahan yang tidak berkaitan dengan masalah utama.
- Jangan mengganti kode yang sudah bekerja tanpa alasan terverifikasi.

## C. Terminal and Execution Safety
- Jangan menjalankan perintah yang sama berulang-ulang tanpa alasan baru.
- Terapkan timeout pada proses yang berpotensi menggantung.
- Hindari proses terminal interaktif tanpa batas.
- Identifikasi dan hentikan proses yang benar-benar mengalami deadlock atau hang secara aman.
- Jangan menjalankan ulang server apabila instance sebelumnya masih berfungsi.

## D. Token and Context Efficiency
- Hindari membaca file identik berulang kali tanpa perubahan relevan.
- Gunakan pencarian spesifik sebelum membaca seluruh codebase.
- Catat temuan penting dan hasil pengujian sebelumnya.
- Hindari penjelasan internal yang berulang dan tidak memberikan informasi baru.
- Gunakan checkpoint untuk mempertahankan konteks pekerjaan.

## E. Change Management
- Periksa Git status dan diff sebelum perubahan berisiko bila workspace adalah repositori Git.
- Jangan melakukan rollback terhadap perubahan pengguna.
- Catat perubahan, hasil, dan alasan strategi perbaikan.
- Jangan membuat refactoring besar untuk menyelesaikan bug kecil.
- Jangan mengubah file di luar lingkup tugas tanpa kebutuhan jelas.

## F. Completion and Verification
- Setiap tugas harus memiliki kriteria keberhasilan yang terukur.
- Verifikasi keberhasilan menggunakan pengujian relevan.
- Jangan mengklaim masalah terselesaikan tanpa bukti.
- Jika solusi gagal berulang, berhenti dan jelaskan batasannya.
- Jangan terus melakukan optimasi tanpa manfaat yang terukur.

## Circuit Breaker
1. Attempt 1: Analisis, lakukan perubahan minimal, dan uji.
2. Attempt 2: Jika gagal, gunakan hipotesis atau pendekatan berbeda.
3. Attempt 3: Jika masih gagal, lakukan satu percobaan alternatif terakhir yang didukung bukti.
4. STOP: Jika tetap gagal, hentikan percobaan otomatis pada masalah tersebut dan laporkan temuan serta opsi selanjutnya.

Jika dua kegagalan berturut-turut menunjukkan gejala identik, wajib lakukan root cause analysis sebelum percobaan berikutnya.
