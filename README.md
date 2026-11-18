# Planogram Compliance Checker — Fase 1

Microsite mobile-first untuk SPG/MD Tentang Anak: pilih toko → pilih jenis foto (Before/After) → ambil/pilih foto rak → kirim.

## Arsitektur singkat

```
Browser                         API route (server)              Supabase
1. kompres foto (≤1600px, ≤1,5 MB JPEG)
2. POST /api/upload-url  ─────► validasi + signed upload URL ──► Storage (bucket privat)
3. PUT foto ke signed URL (progres) ───────────────────────────► shelf-photos/{store_id}/{yyyy-mm}/{uuid}.jpg
4. POST /api/submissions ─────► cek file + insert baris ───────► tabel submissions
5. /sukses/{id}
```

- `SUPABASE_SERVICE_ROLE_KEY` hanya dipakai di `src/lib/supabase-admin.ts` (`server-only`).
- RLS aktif di `stores` dan `submissions` tanpa policy, sehingga anon key tidak bisa membaca/menulis apa pun.
- Batas 5 MB dan tipe gambar dijaga di 3 lapis: `/api/upload-url`, konfigurasi bucket, dan pengecekan metadata file di `/api/submissions`.

## 1. Menjalankan lokal

Prasyarat: Node.js 20+.

```bash
npm install
cp .env.local.example .env.local   # isi dengan nilai dari Supabase (lihat bagian 2)
npm run dev
```

Buka http://localhost:3000.

### Tes dari HP (Wi-Fi yang sama atau hotspot HP)

HTTP biasa sudah cukup karena tombol kamera memakai `<input capture>`, bukan `getUserMedia`.

1. Cek IP laptop: `ipconfig` → bagian adapter Wi-Fi → IPv4 Address (hotspot Android biasanya `192.168.x.x`, iPhone `172.20.10.x`).
2. Jalankan dev server dengan IP itu: `npm run dev -- -H <IP-laptop>`. Ini perlu karena Next.js memblokir aset dev dari hostname selain yang dipakai saat server dijalankan.
3. Di HP buka `http://<IP-laptop>:3000`.
4. Kalau tidak bisa dibuka, kemungkinan besar diblokir Windows Firewall. Izinkan Node.js saat muncul prompt, atau ubah profil jaringan hotspot menjadi **Private** (Settings → Network & internet → Wi-Fi → nama hotspot).

## 2. Setup Supabase

1. Buat project di https://supabase.com/dashboard.
2. **Migration** (membuat tabel, RLS, dan bucket privat `shelf-photos`):
   - *Cara cepat:* SQL Editor → New query → tempel isi `supabase/migrations/20261026000000_phase1_init.sql` → Run.
   - *Cara CLI:* `npx supabase login` → `npx supabase init` (sekali saja) → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
3. **Seed** 10 toko dummy:
   - SQL Editor → tempel isi `supabase/seed.sql` → Run.
   - Atau dengan CLI: `npx supabase db push --include-seed`.
4. **Cek bucket:** Storage → `shelf-photos` harus berstatus **Private**, dengan file size limit 5 MB dan MIME `image/jpeg, image/png, image/webp`. Bucket ini sudah dibuat oleh migration; jangan dibuat manual.
5. **Isi env:** Project Settings → API, lalu salin ke `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon / publishable key (belum dipakai di fase 1)
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role / secret key (**rahasia**)

Untuk mengganti toko dummy dengan master toko asli, hapus isi tabel `stores` (selama belum ada submisi), lalu import CSV lewat Table Editor dengan kolom `name, chain, area, channel`.

## 2b. Setup analisis AI (fase 2)

1. **Migration fase 2:** SQL Editor → tempel isi `supabase/migrations/20261104000000_phase2_ai_analysis.sql` → Run. Ini menambah kolom `shelf_category`, tabel `submission_analyses`, dan view `analysis_report`. **Wajib dijalankan sebelum memakai kode terbaru**, karena tanpa itu submit akan gagal.
2. **Env:** tambahkan ke `.env.local` (dan Vercel):
   - `ANTHROPIC_API_KEY`: dari console.anthropic.com → API Keys
   - `CRON_SECRET`: string acak panjang, misalnya hasil `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`
3. Restart dev server.

**Cara kerja:** setiap submisi foto **Before** otomatis dianalisis Claude di background (SPG tidak menunggu). Hasilnya ada di tabel `submission_analyses`. Untuk tampilan mirip sheet ShelfChecker (satu baris per produk), buka SQL Editor:

```sql
select * from analysis_report order by submitted_at desc;
```

Hasilnya bisa di-export ke CSV dari SQL Editor.

**Status:** `pending` → `analyzing` → `done` / `failed` (pesan error ada di kolom `error`). Analisis yang gagal atau tertinggal diulang otomatis setiap hari jam 08.00 WIB oleh Vercel Cron, maksimal 3 percobaan per submisi. Untuk mengulang manual:

```bash
curl -X POST https://<domain>/api/analyses/run -H "Authorization: Bearer <CRON_SECRET>"
```

## 2c. Alur planogram (fase 3)

1. **Migration fase 3:** SQL Editor → tempel isi `supabase/migrations/20261104120000_phase3_planogram.sql` → Run. **Wajib sebelum memakai kode terbaru**, karena tanpa itu submit dan analisis akan gagal.
2. **Alur SPG:** pilih toko dan kategori → kirim foto **Before** → muncul planogram (Expert Care / Expert Boost) → tata rak → kirim foto **After**. Kalau halaman planogram tertutup, beranda menampilkan pengingat "Foto After belum dikirim" (disimpan di HP tersebut selama 24 jam).
3. **Penilaian** (Before dan After, tidak ditampilkan ke SPG):
   - `osa_pct`: persentase SKU planogram yang ada di rak.
   - `planogram_compliance_pct`: persentase SKU yang ada **dan** urutannya benar dari kiri ke kanan.
   - `sos_pct`: estimasi Claude untuk porsi rak brand.
   - `eye_level` / `eye_level_m`: posisi blok brand.
4. **Laporan per kunjungan** (Before vs After berdampingan):

   ```sql
   select * from planogram_report order by before_at desc;
   ```

   Detail per SKU ada di `analysis_report` (filter `prompt_version` ke versi terbaru, lihat `PROMPT_VERSION` di `src/lib/analysis/prompts.ts`).

Planogram diubah di `src/lib/planogram.ts`. Perubahan itu otomatis dipakai oleh tampilan SPG dan prompt Claude. Naikkan `PROMPT_VERSION` di `src/lib/analysis/prompts.ts` setiap kali planogram diubah.

## 2d. Saran planogram sesuai kapasitas rak (fase 4)

1. **Migration fase 4:** SQL Editor → tempel isi `supabase/migrations/20261117000000_phase4_capacity_plan.sql` → Run. **Wajib sebelum memakai kode terbaru.**
2. **Alur SPG:**
   1. Kirim foto Before.
   2. Halaman planogram menampilkan "Menganalisis rak…" (biasanya 1–2 menit).
   3. Saran muncul. Isinya foto Before dengan kotak produk yang terdeteksi dan jatah rak yang diukur (± cm), dan daftar SKU per baris rak beserta jumlah facing. SKU yang tidak muat tidak ditampilkan ke SPG (tetap tercatat di kolom `excluded_skus`).
   4. Kirim foto After.

   SPG bisa menekan "Lewati, pakai urutan standar" kalau tidak mau menunggu. Hal yang sama otomatis terjadi kalau analisis gagal atau lebih dari 4 menit. Foto After baru bisa dikirim setelah saran (atau urutan standar) tampil, dan saran yang sudah tampil tidak berubah lagi.
3. **Cara saran dihitung:**
   1. Claude memastikan brand (Expert Care / Expert Boost), menandai setiap SKU, dan menandai jatah rak brand per baris.
   2. Lebar rak (cm) dihitung dari lebar produk yang terlihat di foto (lihat `widthCm` di `src/lib/planogram.ts`). Kalau tidak ada produk yang bisa dipakai sebagai penggaris, dipakai perkiraan Claude. Lebar rak tidak pernah dihitung lebih kecil dari total lebar asli produk brand yang sudah terpajang di baris itu.
   3. Rak diisi 1 facing per SKU sesuai urutan daftar, berhenti saat penuh. Setiap baris boleh lebih 5 cm dari lebar terukur (`SHELF_TOLERANCE_CM`), dihitung total per baris. Sisa ruang diberikan ke SKU teratas dulu, maksimal 3 facing per SKU (`MAX_FACINGS_PER_SKU`).
4. **Penilaian Before dan After** sama-sama memakai saran yang dilihat SPG (Before dinilai ulang setelah After masuk), jadi perbandingannya setara: `osa_pct`, `planogram_compliance_pct` (urutan), dan `facing_compliance_pct` (jumlah facing cukup). Lihat kolom `suggested_plan`, `excluded_skus`, dan `shelf_width_cm` di `planogram_report`.

**Tinggi rak:** Claude hanya menghitung posisi shelf dari bawah (shelf paling bawah = 1). Tingginya dihitung kode dengan asumsi setiap shelf berjarak 20 cm, jadi shelf ke-5 = 100 cm. Labelnya: Bawah ≤ 40 cm, Tengah ≤ 80 cm, Eye Level ≤ 140 cm, Atas di atasnya. Asumsi ini bisa diubah di `src/lib/analysis/shelf-height.ts`. Agar tinggi per SKU dan per brand muncul di laporan, jalankan `supabase/migrations/20261118000000_shelf_height.sql`. Migration ini hanya menambah kolom laporan, jadi aplikasi tetap jalan tanpa itu.

`widthCm` per SKU diambil dari kolom "M width (cm)" di Lark sheet SKU Registration (unit PCS). Kalau ukuran kemasan berubah, ubah di `src/lib/planogram.ts` dan naikkan `PROMPT_VERSION`.

## 3. Deploy ke Vercel

1. Push repo ke GitHub/GitLab. `.env.local` sudah di-ignore.
2. Di Vercel: **Add New → Project** → import repo. Framework Next.js terdeteksi otomatis.
3. **Environment Variables**: isi semua variabel dari `.env.local.example` (termasuk `ANTHROPIC_API_KEY` dan `CRON_SECRET`) untuk Production dan Preview. Vercel otomatis mengirim `CRON_SECRET` saat menjalankan cron di `vercel.json`.
4. Klik Deploy, lalu buka URL-nya di HP dan uji alur kirim foto.

Setelah env var diubah, lakukan redeploy supaya nilainya terpakai.

## Struktur

```
src/app/page.tsx                 form utama (daftar toko di-stream dari server)
src/app/planogram/[id]/page.tsx  planogram + form foto After
src/app/sukses/[id]/page.tsx     halaman sukses
src/lib/planogram.ts             daftar SKU (urutan + lebar), penyusun saran sesuai kapasitas
src/app/api/plan/[id]/route.ts   status saran untuk halaman planogram (tanpa skor)
src/lib/analysis/                prompt, panggilan Claude, antrean, hitung OSA/kepatuhan
src/app/api/upload-url/route.ts  validasi + signed upload URL
src/app/api/submissions/route.ts verifikasi file + simpan submisi
src/components/                  SubmissionForm (Before), AfterForm, PlanogramGuide, PhotoPicker, …
src/lib/                         supabase-admin (server-only), data, kompresi, upload, validasi
supabase/migrations/             skema database + bucket
supabase/seed.sql                10 toko dummy
```
