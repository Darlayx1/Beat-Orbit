# Deployment GitHub Pages

Repositori target: https://github.com/Darlayx1/Beat-Orbit

Alamat aplikasi yang ditargetkan: https://darlayx1.github.io/Beat-Orbit/

## Alur deployment

Workflow .github/workflows/deploy.yml berjalan ketika main diperbarui atau melalui workflow_dispatch.
Pull request menjalankan pemeriksaan yang sama tanpa melakukan deployment.

1. npm ci menggunakan dependency yang dikunci dalam package-lock.json.
2. Unit, integration, dan DOM tests wajib lulus.
3. Build menggunakan VITE_BASE_PATH=/Beat-Orbit/ agar JavaScript, CSS, font, dan favicon dapat dimuat dari subdirektori Pages.
4. Chromium menjalankan skenario browser desktop dan mobile landscape pada build produksi.
5. Laporan, screenshot, dan trace kegagalan disimpan sebagai artifact browser-verification selama tujuh hari.
6. Hanya build yang lulus pemeriksaan yang dikirim ke GitHub Pages.

GitHub Pages perlu memakai source **GitHub Actions** pada Settings → Pages.
Workflow tidak menyimpan personal access token. Deployment memakai GITHUB_TOKEN dan OIDC dengan izin Pages khusus pada job deployment.

## Menjalankan pemeriksaan sendiri

    npm ci
    npm test
    npm run test:e2e

Pada mesin lokal, browser suite menggunakan Google Chrome yang terpasang, membangun aplikasi, lalu menjalankan preview produksi.
Di GitHub Actions, suite menggunakan Chromium yang diinstal oleh workflow dan build yang telah diverifikasi.

Untuk memeriksa situs yang sudah dideploy menggunakan suite yang sama, atur PLAYWRIGHT_BASE_URL ke alamat aplikasi lengkap, termasuk trailing slash.
Pengujian membuat library terisolasi pada profil browser sementara; tidak menggunakan library pengguna.

## Data lokal

Musik dan chart tetap berada di IndexedDB pengunjung. GitHub hanya meng-host aplikasi statis, font, serta kode pembuat demo audio.
Library localhost tidak otomatis berpindah ke domain github.io. Ekspor JSON dan impor kembali audio asli jika perlu memindahkan chart.

Status deployment aktual dicatat pada docs/STATUS.md dan GitHub Actions. Jangan menyatakan situs aktif hanya berdasarkan konfigurasi atau build lokal.
