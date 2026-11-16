# Perubahan terbaru

## 1. Daftar misi dan peta (baru)
- `src/systems/MissionManager.js`: daftar misi tampil di kanan atas sejak game mulai, misi baru muncul
  setelah prasyaratnya selesai, yang selesai dicoret. **J** = sembunyikan/tampilkan, **M** = buka peta.
- Peta menggambar area tempat pemain berada (hall, Infirmary, Cell Block, Boiler Room, Experiment Chamber),
  posisi + arah pemain, pintu, gerbang, dan titik tujuan misi aktif.
- Teks misi ada di array `MISSIONS` (bahasa Inggris, sama seperti teks game lainnya).

## 2. Pencahayaan seimbang
- Penyebab hall gelap: lampu lama berada di luar ruang yang bisa dilalui, material GLB hanya memakai 4 lampu,
  dan `flickerLights()` dipanggil dua kali sehingga lampu mati permanen setelah kejadian pertama.
- Sekarang: 6 lampu langit-langit di dalam hall, lampu hanya aktif di area tempat pemain berada, cahaya
  emissive wing dikurangi, dan semua angka ada di `LIGHT_BALANCE` (EnvironmentManager.js).
- Saat bermain: **1/2** hall redup/terang, **3/4** wing, **5/6** Experiment Chamber (hasil di konsol F12).

## 3. Pintu putih HD
- `DoorFactory.js` + `TextureForge.js`: tekstur 1024x2048 (cat terkelupas, karat, panel timbul + normal map,
  jendela berkawat), bingkai baja, engsel, gagang, papan nama. Filter anisotropik 16x.
- Dipakai untuk ward_gate, restricted_gate (varian bahaya + rantai), pintu wing, pintu keluar, pintu Chamber.
- Daun pintu gerbang kini berayun terbuka. Ganti `USE_HD_DOORS = false` di SceneManager.js untuk kembali ke iron_gate.glb.
- Tekstur dibuat bertahap di latar belakang (`TexturePool.js`) supaya game tidak macet saat dimuat.

## 4. Ruangan baru: Experiment Chamber
- Pintu di dinding selatan area terlarang, tepat di balik pintu putih. Boleh dipakai saat monster mengejar.
- Observation Room (konsol, monitor, arsip, papan tulis) + Chamber (mesin, 6 tiang, lingkaran ritual,
  mural wajah tersenyum, rak sampel, brankar, meja bedah, kandang), 3 dokumen cerita, 3 baterai.
- Alur: buka pintu putih -> monster muncul -> lari ke Chamber (monster berhenti, menggedor pintu) ->
  ambil **Main Exit Key** (dipindah ke sini) -> lingkaran pecah -> keluar, monster muncul lagi di ujung
  timur -> lari ke pintu keluar di ujung barat.
- Denah: `LabLayout.js`. Cek tabrakan offline: `npm run check:layout`.

## 5. Penempatan yang nabrak
- Denah Chamber diuji otomatis (tumpang tindih, jarak ke dinding, jalur masuk bebas).
- Denah hall, 3 wing, dan posisi meja dicocokkan dengan lantai model GLB: tidak ditemukan objek yang menembus dinding.
- Perbaikan lain: pemain tidak bisa lagi berjalan setelah tertangkap / game selesai.
