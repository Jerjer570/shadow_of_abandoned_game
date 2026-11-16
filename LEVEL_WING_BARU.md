# Wing baru dan alur permainan yang diperpanjang

Model `corridor_baru.glb` hanya satu ruang besar (sekitar 20 x 18 m). Pintu-pintu di
dindingnya adalah gambar tanpa ruangan di belakangnya, jadi tidak bisa dibuka.
Supaya game lebih panjang, ada tiga ruangan baru yang dibuat dari kode
(`src/systems/WingBuilder.js`) dan dihubungkan lewat pintu yang benar-benar bisa dibuka.

## Alur permainan

1. Ambil **Ward Gate Key** di ruang awal, buka `ward_gate` (sama seperti sebelumnya).
2. **Infirmary** (pintu di dinding barat ruang kiri, tidak terkunci): ambil **Cell Block Key**, 1 dokumen, 1 baterai.
3. **Cell Block** (pintu di dinding barat kolom tengah, butuh Cell Block Key): ambil **Boiler Room Key**, **Generator Fuse**, 2 dokumen, 2 baterai.
4. **Boiler Room** (pintu di dinding timur lengan kanan, butuh Boiler Room Key): pasang fuse ke generator, nyalakan. 1 dokumen, 1 baterai.
5. Listrik menyala. `restricted_gate` sekarang butuh **Restricted Wing Key** (kunci lama) **dan** listrik.
6. Gerbang terbuka, monster muncul. Ambil **Main Exit Key** di area terlarang.
7. Lari ke pintu di ujung barat koridor (tempat kamu mulai), buka dengan Main Exit Key. Game selesai.

Selama monster aktif, pintu ke wing tidak bisa dipakai. Di dalam wing ada scare kecil
(lampu berkedip dan sosok hitam yang muncul sebentar).

## Mengubah tata letak

- Posisi pintu di koridor utama: `HULL_DOORS` di `WingBuilder.js`.
- Posisi wing di dunia: `WING_ORIGINS` (jauh dari koridor, jangan dekatkan).
- Ukuran ruangan, dinding, dan letak item: fungsi `buildInfirmary`, `buildCellBlock`, `buildBoilerRoom`.
- Posisi Main Exit Key: `HORROR_LAYOUT.exitKey` di `SceneManager.js`.
- Tekan **P** di game untuk melihat koordinat pemain di konsol.
