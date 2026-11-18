// ================================================================================
// SHELFCHECKER — Google Apps Script Automation  v3.0
// Tentang Anak · Shelf Visibility Tracking System
//
// HOW TO USE (setup pertama kali):
//   1. Extensions → Apps Script → hapus isi lama → paste SELURUH file ini → Save
//   2. Project Settings (⚙) → Script Properties → ANTHROPIC_API_KEY = sk-ant-...
//   3. Run debugFormStructure()  → pastikan kolom foto terdeteksi benar
//   4. Run checkApiKey()         → pastikan API key valid
//   5. Triggers (⏰) → Add Trigger → onFormSubmit / From spreadsheet / On form submit
//      → Failure notification settings: "Notify me immediately"
//   6. Selesai — setiap submission form otomatis dianalisis
//
// MENGEJAR BARIS YANG TERTINGGAL:
//   Run startBackfill()  → jalan otomatis berulang sampai semua baris kosong terisi
//   Run backfillStatus() → cek progres kapan saja (aman, tidak mengganggu)
//   Run stopBackfill()   → hentikan di tengah jalan
//
// CHANGELOG v3.0:
//   - TAMBAHAN: modul Backfill (startBackfill / stopBackfill / backfillStatus)
//     · mencari sendiri baris berstatus kosong DAN yang nyangkut di ⏳
//     · auto-resume tiap ±1 menit, tahan limit eksekusi 6 menit
//     · jaring pengaman kalau satu run dibunuh Google di tengah proses
//   - Tidak ada perubahan pada logika analisis v2.1 — semua fungsi lama utuh
//
// CHANGELOG v2.1:
//   - Replaced hardcoded column indices with auto-detection by header name
//   - Added debugFormStructure() diagnostic tool
//   - Fixed skincare/vitamin column ordering issues
// ================================================================================


// ── STATIC CONFIG ─────────────────────────────────────────────────────────────
const FORM_SHEET_NAME = 'Form Responses 1';
const DASHBOARD_SHEET = 'Dashboard';
const MODEL           = 'claude-opus-4-6';

// ── MANUAL OVERRIDES (optional) ───────────────────────────────────────────────
// If auto-detection fails for a column, set the correct 0-based index here.
// Leave as -1 to use auto-detection. Run debugFormStructure() to find the right values.
//
// Example: if your Skincare photo is in column G (index 6), set SKINCARE_PHOTO: 6
const FORM_COLS_OVERRIDE = {
  TIMESTAMP:       0,   // Always 0 — do not change
  SALESPERSON:    -1,   // -1 = auto-detect
  STORE_NAME:     -1,
  STORE_CITY:     -1,   // Set to -1 if you don't have a City field
  VISIT_DATE:     -1,
  SKINCARE_PHOTO: -1,
  VITAMIN_PHOTO:  -1,
  NOTES:          -1,
};


// ── AUTO-DETECT FORM COLUMNS FROM HEADER NAMES ────────────────────────────────
// Reads row 1 of the form sheet and matches columns by keyword.
// Call debugFormStructure() to see what it detects for your specific form.
function detectFormColumns(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // ── CRITICAL: find where analysis columns begin FIRST ───────────────────
  // The analysis area always starts with '📊 Status Analisis'.
  // We ONLY scan headers BEFORE this marker so that analysis column names
  // (e.g. '🧴 Skincare — Skor', '💊 Vitamin — Ringkasan') are never
  // mistaken for form question columns.
  var scanUpTo = headers.length; // default: scan all (analysis not written yet)
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).includes('Status Analisis')) {
      scanUpTo = j; // stop before first analysis header
      break;
    }
  }

  var detected = {
    TIMESTAMP:       0,   // Always column A
    SALESPERSON:    -1,
    STORE_NAME:     -1,
    STORE_CITY:     -1,
    VISIT_DATE:     -1,
    SKINCARE_PHOTO: -1,
    VITAMIN_PHOTO:  -1,
    NOTES:          -1,
  };

  // ── Scan only form columns; stop at FIRST match per field ────────────────
  // Using a for-loop (not forEach) so we can skip already-matched fields
  // and avoid late analysis headers overwriting earlier correct matches.
  for (var i = 1; i < scanUpTo; i++) {
    var h = String(headers[i]).toLowerCase().trim();
    if (!h) continue;

    if (detected.SKINCARE_PHOTO === -1 && h.includes('skincare')) {
      detected.SKINCARE_PHOTO = i;

    } else if (detected.VITAMIN_PHOTO === -1 &&
               (h.includes('vitamin') || h.includes('multivitamin') ||
                h.includes('suplemen') || h.includes('supplement'))) {
      detected.VITAMIN_PHOTO = i;

    } else if (detected.STORE_NAME === -1 &&
               (h.includes('toko') || h.includes('store') ||
                h.includes('outlet') || h.includes('nama toko'))) {
      detected.STORE_NAME = i;

    } else if (detected.STORE_CITY === -1 &&
               (h.includes('kota') || h.includes('area') || h.includes('city') ||
                h.includes('region') || h.includes('wilayah') || h.includes('cabang'))) {
      detected.STORE_CITY = i;

    } else if (detected.VISIT_DATE === -1 &&
               (h.includes('tanggal') || h.includes('date') ||
                h.includes('kunjungan') || h.includes('tgl') || h.includes('visit'))) {
      detected.VISIT_DATE = i;

    } else if (detected.NOTES === -1 &&
               (h.includes('catatan') || h.includes('notes') ||
                h.includes('tambahan') || h.includes('keterangan') || h.includes('informasi'))) {
      detected.NOTES = i;

    } else if (detected.SALESPERSON === -1 &&
               (h.includes('salesman') || h.includes('merchandiser') ||
                h.includes('nama lengkap') || h.includes('nama anda') ||
                h.includes('petugas') || h.includes('nama sales'))) {
      detected.SALESPERSON = i;

    } else if (detected.SALESPERSON === -1 && h.includes('nama')) {
      detected.SALESPERSON = i;
    }
  }

  // ── Apply manual overrides ───────────────────────────────────────────────
  Object.keys(FORM_COLS_OVERRIDE).forEach(function(key) {
    if (FORM_COLS_OVERRIDE[key] !== -1) {
      detected[key] = FORM_COLS_OVERRIDE[key];
    }
  });

  return detected;
}

// How many form columns exist? = 0-based index of first analysis column.
function getFormColCount(sheet, cols) {
  // Primary: look for the analysis area marker in row 1
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).includes('Status Analisis')) {
      return i;
    }
  }

  // Fallback: analysis not written yet — derive from detected form cols.
  // Cap at 20 to avoid a runaway value from a bad detection.
  var maxFormCol = 0;
  Object.values(cols).forEach(function(v) {
    if (typeof v === 'number' && v > 0 && v < 20 && v > maxFormCol) maxFormCol = v;
  });
  return maxFormCol > 0 ? maxFormCol + 1 : 8; // default 8 if nothing detected
}


// ── PRODUCT DEFINITIONS ──────────────────────────────────────────────────────
const PRODUCT_LABELS = {
  expert_care:  'Expert Care',
  gently:       'Gently',
  moell:        'Moell',
  expert_boost: 'Expert Boost',
  youvit:       'Youvit',
};

// ── ANALYSIS COLUMN HEADERS ──────────────────────────────────────────────────
const ANALYSIS_HEADERS = [
  '📊 Status Analisis',

  // Skincare Shelf
  '🧴 Skincare — Skor (0-100)', '🧴 Skincare — Ringkasan',
  'Expert Care — Ditemukan?',   'Expert Care — Share of Shelf (%)',   'Expert Care — Eye Level (m)',   'Expert Care — Visibilitas',   'Expert Care — Blocking',
  'Gently — Ditemukan?',        'Gently — Share of Shelf (%)',        'Gently — Eye Level (m)',        'Gently — Visibilitas',        'Gently — Blocking',
  'Moell — Ditemukan?',         'Moell — Share of Shelf (%)',         'Moell — Eye Level (m)',         'Moell — Visibilitas',         'Moell — Blocking',
  '🧴 Skincare — Kompetitor',   '🧴 Skincare — Rekomendasi',

  // Vitamin Shelf
  '💊 Vitamin — Skor (0-100)',  '💊 Vitamin — Ringkasan',
  'Expert Boost — Ditemukan?',  'Expert Boost — Share of Shelf (%)', 'Expert Boost — Eye Level (m)', 'Expert Boost — Visibilitas', 'Expert Boost — Blocking',
  'Youvit — Ditemukan?',        'Youvit — Share of Shelf (%)',        'Youvit — Eye Level (m)',        'Youvit — Visibilitas',        'Youvit — Blocking',
  '💊 Vitamin — Kompetitor',    '💊 Vitamin — Rekomendasi',

  '⚠️ Error Log',
];
const TOTAL_ANALYSIS_COLS = ANALYSIS_HEADERS.length; // 35


// ================================================================================
// MAIN TRIGGER
// ================================================================================
function onFormSubmit(e) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);

  if (!sheet) {
    Logger.log('ERROR: Sheet "' + FORM_SHEET_NAME + '" not found.');
    return;
  }

  var row  = e.range.getRow();
  var cols = detectFormColumns(sheet);

  Logger.log('Detected columns for row ' + row + ': ' + JSON.stringify(cols));

  ensureAnalysisHeaders(sheet, cols);
  setAnalysisCell(sheet, row, cols, 0, '⏳ Sedang dianalisis...');
  SpreadsheetApp.flush();

  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('API Key belum diset. Buka Project Settings (⚙) → Script Properties → tambahkan ANTHROPIC_API_KEY');
    }

    // Read values from the form row using detected column positions
    var totalFormCols = Math.max.apply(null, Object.values(cols).filter(function(v) { return v >= 0; })) + 1;
    var rowData       = sheet.getRange(row, 1, 1, totalFormCols).getValues()[0];

    var skincareUrl = cols.SKINCARE_PHOTO >= 0 ? extractUrlFromCell(rowData[cols.SKINCARE_PHOTO]) : '';
    var vitaminUrl  = cols.VITAMIN_PHOTO  >= 0 ? extractUrlFromCell(rowData[cols.VITAMIN_PHOTO])  : '';

    Logger.log('Skincare URL (col ' + cols.SKINCARE_PHOTO + '): ' + skincareUrl);
    Logger.log('Vitamin URL  (col ' + cols.VITAMIN_PHOTO  + '): ' + vitaminUrl);

    var skincareResult = null;
    var vitaminResult  = null;
    var errors         = [];

    if (skincareUrl) {
      try {
        setAnalysisCell(sheet, row, cols, 0, '⏳ Menganalisis rak skincare...');
        SpreadsheetApp.flush();
        skincareResult = analyzePhoto(apiKey, skincareUrl, 'skincare');
      } catch (err) {
        errors.push('[Skincare] ' + err.message);
        Logger.log('Skincare analysis error: ' + err.message);
      }
    } else {
      errors.push('[Skincare] Foto tidak ditemukan di kolom ' + cols.SKINCARE_PHOTO + '. Jalankan debugFormStructure() untuk cek mapping kolom.');
    }

    if (vitaminUrl) {
      try {
        setAnalysisCell(sheet, row, cols, 0, '⏳ Menganalisis rak vitamin...');
        SpreadsheetApp.flush();
        vitaminResult = analyzePhoto(apiKey, vitaminUrl, 'vitamin');
      } catch (err) {
        errors.push('[Vitamin] ' + err.message);
        Logger.log('Vitamin analysis error: ' + err.message);
      }
    } else {
      errors.push('[Vitamin] Foto tidak ditemukan di kolom ' + cols.VITAMIN_PHOTO + '. Jalankan debugFormStructure() untuk cek mapping kolom.');
    }

    writeResults(sheet, row, cols, skincareResult, vitaminResult, errors);

    var finalStatus = errors.length === 0
      ? '✅ Selesai'
      : (skincareResult || vitaminResult)
        ? '⚠️ Selesai (ada error — lihat Error Log)'
        : '❌ Gagal — lihat Error Log';
    setAnalysisCell(sheet, row, cols, 0, finalStatus);

    refreshDashboard(ss);

  } catch (fatalErr) {
    Logger.log('FATAL ERROR row ' + row + ': ' + fatalErr.message + '\n' + fatalErr.stack);
    setAnalysisCell(sheet, row, cols, 0, '❌ Error Fatal');
    setAnalysisCell(sheet, row, cols, TOTAL_ANALYSIS_COLS - 1, fatalErr.message);
  }
}


// ================================================================================
// EXTRACT URL — safely converts a cell value to a Drive URL string
// Handles: string URLs, Date objects (which should NOT be in a photo column),
// and empty values. Returns '' if not a recognizable URL.
// ================================================================================
function extractUrlFromCell(cellValue) {
  if (!cellValue) return '';

  // If it's a Date object, it means the column mapping is wrong
  if (cellValue instanceof Date) {
    Logger.log('WARNING: Expected a file URL but got a Date object: ' + cellValue.toString() +
      '. This means SKINCARE_PHOTO or VITAMIN_PHOTO is pointing to a date column. ' +
      'Run debugFormStructure() to find the correct column indices, then set FORM_COLS_OVERRIDE.');
    return '';
  }

  var str = String(cellValue).trim();

  // Must look like a URL or a Drive file ID
  if (str.startsWith('http') || str.match(/^[a-zA-Z0-9_-]{20,}$/)) {
    return str;
  }

  Logger.log('WARNING: Cell value does not look like a file URL: ' + str.substring(0, 80));
  return '';
}


// ================================================================================
// IMAGE COMPRESSION
// The Claude API rejects images whose base64-encoded size exceeds 5 MB
// (5,242,880 bytes). Base64 adds ~33% overhead, so the safe raw limit is ~3.7 MB.
// When a photo exceeds this, we fetch a smaller version via Google Drive's
// thumbnail service (Drive compresses + resizes it server-side for free).
// ================================================================================

// Raw byte threshold — base64 of anything under this is safely below 5 MB
var MAX_RAW_BYTES = 3.5 * 1024 * 1024; // 3.5 MB raw  ≈  4.67 MB base64

function getCompressedImageBlob(file, fileId) {
  var blob      = file.getBlob();
  var rawBytes  = blob.getBytes().length;

  // Already small enough — no compression needed
  if (rawBytes <= MAX_RAW_BYTES) {
    Logger.log('Foto OK: ' + Math.round(rawBytes / 1024) + ' KB — tidak perlu dikompres.');
    return blob;
  }

  Logger.log('Foto terlalu besar: ' + Math.round(rawBytes / 1024 / 1024 * 10) / 10 +
             ' MB. Mengkompres via Drive thumbnail...');

  // Ask Drive to resize the image server-side.
  // We try progressively smaller widths until the result is under the limit.
  var widths = [2000, 1600, 1200, 800];
  var token  = ScriptApp.getOAuthToken();

  for (var i = 0; i < widths.length; i++) {
    var w   = widths[i];
    var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + w;

    try {
      var res = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true,
      });

      if (res.getResponseCode() !== 200) {
        Logger.log('Thumbnail w' + w + ' gagal (HTTP ' + res.getResponseCode() + ') — coba ukuran berikutnya.');
        continue;
      }

      var resized     = res.getBlob().setContentType('image/jpeg');
      var resizedSize = resized.getBytes().length;
      Logger.log('Dikompres ke w' + w + 'px → ' + Math.round(resizedSize / 1024) + ' KB');

      if (resizedSize <= MAX_RAW_BYTES) {
        return resized;
      }
      // Still too large → try next smaller width

    } catch (err) {
      Logger.log('Error saat kompres ke w' + w + ': ' + err.message);
    }
  }

  // All widths exhausted — throw a clear error
  throw new Error(
    'Foto terlalu besar (' + Math.round(rawBytes / 1024 / 1024 * 10) / 10 + ' MB) ' +
    'dan tidak bisa dikompres secara otomatis. ' +
    'Minta tim untuk mengurangi resolusi kamera atau menggunakan aplikasi kompres foto ' +
    'sebelum upload (target < 8 MP).'
  );
}


// ================================================================================
// PHOTO ANALYSIS
// ================================================================================
function analyzePhoto(apiKey, photoUrl, shelfType) {
  var fileId = extractDriveFileId(photoUrl);
  if (!fileId) throw new Error('Tidak bisa mengekstrak File ID dari URL: ' + photoUrl.substring(0, 100));

  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    throw new Error('File tidak bisa diakses dari Drive (ID: ' + fileId + '). Error: ' + e.message);
  }

  // Compress if photo exceeds API limit — transparent to the rest of the function
  var blob     = getCompressedImageBlob(file, fileId);
  var base64   = Utilities.base64Encode(blob.getBytes());
  var mimeType = blob.getContentType() || 'image/jpeg';
  var prompt   = buildPrompt(shelfType);

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    var errMsg = 'HTTP ' + code;
    try { errMsg = JSON.parse(body).error.message || errMsg; } catch (_) {}
    throw new Error('Claude API error: ' + errMsg);
  }

  var data    = JSON.parse(body);
  var rawText = data.content.map(function(b) { return b.text || ''; }).join('');
  var clean   = rawText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (_) {
    var match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gagal parse JSON dari Claude. Preview: ' + clean.substring(0, 200));
  }
}


// ================================================================================
// PROMPT BUILDER
// ================================================================================
function buildPrompt(shelfType) {
  var sharedNote = '\nFor each product:\n' +
    '- found: true if visible anywhere on the shelf\n' +
    '- share_of_shelf_pct: % of total shelf linear space (0-100). null if not found.\n' +
    '- eye_level_m: height from floor in meters. Reference: bottom ~0.2-0.5m, mid ~0.6-0.9m, eye level ~1.0-1.5m, top ~1.6-2.0m. null if not found.\n' +
    '- visibility: "Baik" / "Sebagian" / "Buruk" / "Tidak Ditemukan"\n' +
    '- blocking: describe any obstruction, or "Bebas" if clear, or "Tidak Ditemukan" if product absent\n\n' +
    'Return ONLY a raw JSON object — no markdown, no explanation.';

  if (shelfType === 'skincare') {
    return 'You are a professional retail shelf visibility analyst. Analyze this SKINCARE SHELF photo.\n\n' +
      'TARGET PRODUCTS (all by Tentang Anak brand):\n' +
      '1. Expert Care (skincare product)\n' +
      '2. Gently (skincare product)\n' +
      '3. Moell (skincare product)\n\n' +
      'Also identify competitor brands (e.g. Cetaphil, Dove, Vaseline, Nivea, Wardah, dll).\n' +
      sharedNote + '\n\n' +
      'JSON structure:\n' +
      '{\n' +
      '  "shelf_type": "skincare",\n' +
      '  "overall_score": <0-100>,\n' +
      '  "shelf_summary": "<1 sentence>",\n' +
      '  "products": {\n' +
      '    "expert_care":  { "found": bool, "share_of_shelf_pct": num|null, "eye_level_m": num|null, "visibility": str, "blocking": str, "facing_count": int, "notes": str },\n' +
      '    "gently":       { "found": bool, "share_of_shelf_pct": num|null, "eye_level_m": num|null, "visibility": str, "blocking": str, "facing_count": int, "notes": str },\n' +
      '    "moell":        { "found": bool, "share_of_shelf_pct": num|null, "eye_level_m": num|null, "visibility": str, "blocking": str, "facing_count": int, "notes": str }\n' +
      '  },\n' +
      '  "top_competitors": ["brand1", "brand2", "brand3"],\n' +
      '  "recommendations": ["rec1", "rec2", "rec3"]\n' +
      '}';
  }

  return 'You are a professional retail shelf visibility analyst. Analyze this VITAMIN / SUPPLEMENT SHELF photo.\n\n' +
    'TARGET PRODUCTS:\n' +
    '1. Expert Boost (vitamin/supplement by Tentang Anak)\n' +
    '2. Youvit (vitamin/supplement product)\n\n' +
    'Also identify competitor brands (e.g. Blackmores, Centrum, Enervon, Vitacimin, Hemaviton, dll).\n' +
    sharedNote + '\n\n' +
    'JSON structure:\n' +
    '{\n' +
    '  "shelf_type": "vitamin",\n' +
    '  "overall_score": <0-100>,\n' +
    '  "shelf_summary": "<1 sentence>",\n' +
    '  "products": {\n' +
    '    "expert_boost": { "found": bool, "share_of_shelf_pct": num|null, "eye_level_m": num|null, "visibility": str, "blocking": str, "facing_count": int, "notes": str },\n' +
    '    "youvit":       { "found": bool, "share_of_shelf_pct": num|null, "eye_level_m": num|null, "visibility": str, "blocking": str, "facing_count": int, "notes": str }\n' +
    '  },\n' +
    '  "top_competitors": ["brand1", "brand2", "brand3"],\n' +
    '  "recommendations": ["rec1", "rec2", "rec3"]\n' +
    '}';
}


// ================================================================================
// WRITE RESULTS
// ================================================================================
function writeResults(sheet, row, cols, skincareResult, vitaminResult, errors) {
  var formColCount = getFormColCount(sheet, cols);
  var vals         = new Array(TOTAL_ANALYSIS_COLS).fill('');

  // Skincare overview (idx 1, 2)
  if (skincareResult) {
    vals[1] = skincareResult.overall_score  !== undefined ? skincareResult.overall_score : '';
    vals[2] = skincareResult.shelf_summary  || '';
  }
  // Expert Care (3–7), Gently (8–12), Moell (13–17)
  writeProductBlock(vals, 3,  skincareResult, 'expert_care');
  writeProductBlock(vals, 8,  skincareResult, 'gently');
  writeProductBlock(vals, 13, skincareResult, 'moell');
  // Skincare competitors + recs (18, 19)
  if (skincareResult) {
    vals[18] = (skincareResult.top_competitors || []).join(', ');
    vals[19] = (skincareResult.recommendations || []).join(' | ');
  }

  // Vitamin overview (20, 21)
  if (vitaminResult) {
    vals[20] = vitaminResult.overall_score !== undefined ? vitaminResult.overall_score : '';
    vals[21] = vitaminResult.shelf_summary  || '';
  }
  // Expert Boost (22–26), Youvit (27–31)
  writeProductBlock(vals, 22, vitaminResult, 'expert_boost');
  writeProductBlock(vals, 27, vitaminResult, 'youvit');
  // Vitamin competitors + recs (32, 33)
  if (vitaminResult) {
    vals[32] = (vitaminResult.top_competitors || []).join(', ');
    vals[33] = (vitaminResult.recommendations || []).join(' | ');
  }

  // Error log (34)
  vals[34] = errors.length ? errors.join(' | ') : '';

  // Write in one call (start from col after form columns, skip status col which is already set)
  var startCol = formColCount + 1; // 1-indexed; col 0 = status already written
  sheet.getRange(row, startCol, 1, TOTAL_ANALYSIS_COLS).setValues([vals]);

  applyRowFormatting(sheet, row, formColCount, vals);
}

function writeProductBlock(vals, startIdx, result, productKey) {
  if (!result || !result.products || !result.products[productKey]) {
    vals[startIdx]     = 'Tidak ada data';
    vals[startIdx + 1] = '-';
    vals[startIdx + 2] = '-';
    vals[startIdx + 3] = '-';
    vals[startIdx + 4] = '-';
    return;
  }
  var p = result.products[productKey];
  vals[startIdx]     = p.found ? 'Ya ✅' : 'Tidak ❌';
  vals[startIdx + 1] = (p.share_of_shelf_pct !== null && p.share_of_shelf_pct !== undefined) ? p.share_of_shelf_pct + '%' : '-';
  vals[startIdx + 2] = (p.eye_level_m !== null && p.eye_level_m !== undefined) ? p.eye_level_m + ' m' : '-';
  vals[startIdx + 3] = p.visibility || '-';
  vals[startIdx + 4] = p.blocking   || '-';
}


// ================================================================================
// FORMATTING
// ================================================================================
function applyRowFormatting(sheet, row, formColCount, vals) {
  var startCol = formColCount + 1; // 1-indexed

  // "Ditemukan?" columns — offsets 3, 8, 13, 22, 27
  [3, 8, 13, 22, 27].forEach(function(offset) {
    var cell = sheet.getRange(row, startCol + offset);
    var val  = String(vals[offset] || '');
    if (val.startsWith('Ya'))   cell.setBackground('#e6f4ea').setFontColor('#137333').setFontWeight('bold');
    else if (val.startsWith('Tidak')) cell.setBackground('#fce8e6').setFontColor('#c5221f').setFontWeight('bold');
  });

  // "Visibilitas" columns — offsets 6, 11, 16, 25, 30
  var visColors = {
    'Baik':            { bg: '#e6f4ea', fg: '#137333' },
    'Sebagian':        { bg: '#fff9c4', fg: '#7b5800' },
    'Buruk':           { bg: '#fce8e6', fg: '#c5221f' },
    'Tidak Ditemukan': { bg: '#f1f3f4', fg: '#5f6368' },
  };
  [6, 11, 16, 25, 30].forEach(function(offset) {
    var cell = sheet.getRange(row, startCol + offset);
    var vis  = String(vals[offset] || '');
    if (visColors[vis]) cell.setBackground(visColors[vis].bg).setFontColor(visColors[vis].fg);
  });

  // Score cells — offsets 1, 20
  [1, 20].forEach(function(offset) {
    var cell  = sheet.getRange(row, startCol + offset);
    var score = parseFloat(vals[offset]);
    if (!isNaN(score)) {
      if (score >= 75)      cell.setBackground('#e6f4ea').setFontColor('#137333').setFontWeight('bold');
      else if (score >= 50) cell.setBackground('#fff9c4').setFontColor('#7b5800').setFontWeight('bold');
      else                  cell.setBackground('#fce8e6').setFontColor('#c5221f').setFontWeight('bold');
    }
  });
}


// ================================================================================
// HEADER SETUP
// ================================================================================
function ensureAnalysisHeaders(sheet, cols) {
  var formColCount   = getFormColCount(sheet, cols);
  var firstAnalysisCol = formColCount + 1; // 1-indexed

  // Check if headers already exist
  if (sheet.getRange(1, firstAnalysisCol).getValue() === ANALYSIS_HEADERS[0]) return;

  var headerRange = sheet.getRange(1, firstAnalysisCol, 1, TOTAL_ANALYSIS_COLS);
  headerRange.setValues([ANALYSIS_HEADERS]);
  headerRange.setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff').setWrap(true);
  sheet.setRowHeight(1, 60);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);
}

function setAnalysisCell(sheet, row, cols, offset, value) {
  var formColCount = getFormColCount(sheet, cols);
  sheet.getRange(row, formColCount + 1 + offset).setValue(value);
}


// ================================================================================
// DRIVE FILE ID EXTRACTOR
// ================================================================================
function extractDriveFileId(url) {
  if (!url) return null;
  // https://drive.google.com/open?id=FILE_ID
  var match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // https://drive.google.com/file/d/FILE_ID/view
  match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Bare file ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}


// ================================================================================
// DASHBOARD
// ================================================================================
function setupSystem() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "' + FORM_SHEET_NAME + '" tidak ditemukan.\nPastikan Google Form sudah di-link ke spreadsheet ini.');
    return;
  }
  var cols = detectFormColumns(sheet);
  ensureAnalysisHeaders(sheet, cols);
  createDashboard(ss);
  SpreadsheetApp.getUi().alert(
    '✅ ShelfChecker berhasil disetup!\n\n' +
    'Detected columns:\n' +
    'SKINCARE_PHOTO = col ' + (cols.SKINCARE_PHOTO + 1) + '\n' +
    'VITAMIN_PHOTO  = col ' + (cols.VITAMIN_PHOTO  + 1) + '\n\n' +
    'Jika ada yang salah, set manual di FORM_COLS_OVERRIDE.'
  );
}

function createDashboard(ss) {
  var existing = ss.getSheetByName(DASHBOARD_SHEET);
  if (existing) ss.deleteSheet(existing);
  var dash = ss.insertSheet(DASHBOARD_SHEET);

  dash.getRange('A1').setValue('🏬 SHELF VISIBILITY DASHBOARD — Tentang Anak')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1a1a2e');
  dash.getRange('A2').setValue('Sumber: Form Responses 1 | Auto-analyzed by Claude AI')
    .setFontSize(10).setFontColor('#888888');

  var headers = [
    'Tanggal', 'Toko', 'Kota', 'Salesman',
    '🧴 Skor Skincare',
    'Expert Care\nDitemukan?', 'Expert Care\nSoS %', 'Expert Care\nEye Level (m)', 'Expert Care\nVisibilitas',
    'Gently\nDitemukan?',       'Gently\nSoS %',       'Gently\nEye Level (m)',       'Gently\nVisibilitas',
    'Moell\nDitemukan?',        'Moell\nSoS %',         'Moell\nEye Level (m)',        'Moell\nVisibilitas',
    '💊 Skor Vitamin',
    'Expert Boost\nDitemukan?', 'Expert Boost\nSoS %', 'Expert Boost\nEye Level (m)', 'Expert Boost\nVisibilitas',
    'Youvit\nDitemukan?',       'Youvit\nSoS %',        'Youvit\nEye Level (m)',       'Youvit\nVisibilitas',
    'Kompetitor Skincare', 'Kompetitor Vitamin', 'Status',
  ];

  var hr = dash.getRange(4, 1, 1, headers.length);
  hr.setValues([headers]).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff')
    .setWrap(true).setVerticalAlignment('middle');
  dash.setRowHeight(4, 60);
  dash.setFrozenRows(4);
  dash.setFrozenColumns(4);

  dash.setColumnWidth(1, 90); dash.setColumnWidth(2, 160); dash.setColumnWidth(3, 110); dash.setColumnWidth(4, 130);
  dash.setColumnWidth(5, 90);
  for (var c = 6; c <= headers.length; c++) dash.setColumnWidth(c, 85);

  dash.getRange('A5').setValue('← Data akan muncul otomatis di sini setelah submission form dianalisis.')
    .setFontColor('#aaaaaa').setFontStyle('italic');
}

function refreshDashboard(ss) {
  if (!ss.getSheetByName(DASHBOARD_SHEET)) createDashboard(ss);
}


// ================================================================================
// DIAGNOSTIC & MANUAL TOOLS — run these from the Apps Script editor
// ================================================================================

/**
 * ✅ RUN THIS FIRST after pasting the script.
 * Prints the exact column layout of your Form Responses sheet so you can
 * verify that skincare & vitamin columns are detected correctly.
 *
 * How to run: select debugFormStructure → click Run (▶) → open Logs (Ctrl+Enter)
 */
function debugFormStructure() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);
  if (!sheet) { Logger.log('ERROR: Sheet "' + FORM_SHEET_NAME + '" not found.'); return; }

  var lastCol  = sheet.getLastColumn();
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var detected = detectFormColumns(sheet);

  Logger.log('========================================');
  Logger.log('ALL COLUMNS IN "' + FORM_SHEET_NAME + '"');
  Logger.log('========================================');
  headers.forEach(function(h, i) {
    var letter = columnIndexToLetter(i);
    Logger.log('Col ' + letter + ' (index ' + i + '): ' + String(h).substring(0, 60));
  });

  Logger.log('');
  Logger.log('========================================');
  Logger.log('AUTO-DETECTED MAPPINGS');
  Logger.log('========================================');
  Logger.log('SALESPERSON:    col ' + columnIndexToLetter(detected.SALESPERSON)    + ' (index ' + detected.SALESPERSON    + ')');
  Logger.log('STORE_NAME:     col ' + columnIndexToLetter(detected.STORE_NAME)     + ' (index ' + detected.STORE_NAME     + ')');
  Logger.log('STORE_CITY:     col ' + columnIndexToLetter(detected.STORE_CITY)     + ' (index ' + detected.STORE_CITY     + ')');
  Logger.log('VISIT_DATE:     col ' + columnIndexToLetter(detected.VISIT_DATE)     + ' (index ' + detected.VISIT_DATE     + ')');
  Logger.log('SKINCARE_PHOTO: col ' + columnIndexToLetter(detected.SKINCARE_PHOTO) + ' (index ' + detected.SKINCARE_PHOTO + ') ← MUST be correct');
  Logger.log('VITAMIN_PHOTO:  col ' + columnIndexToLetter(detected.VITAMIN_PHOTO)  + ' (index ' + detected.VITAMIN_PHOTO  + ') ← MUST be correct');
  Logger.log('NOTES:          col ' + columnIndexToLetter(detected.NOTES)          + ' (index ' + detected.NOTES          + ')');

  Logger.log('');
  Logger.log('If SKINCARE_PHOTO or VITAMIN_PHOTO are wrong:');
  Logger.log('1. Find the correct column letter/index in the list above');
  Logger.log('2. Set FORM_COLS_OVERRIDE at the top of the script:');
  Logger.log('   SKINCARE_PHOTO: <correct index>');
  Logger.log('   VITAMIN_PHOTO:  <correct index>');

  // Also show a sample data row if one exists
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    Logger.log('');
    Logger.log('========================================');
    Logger.log('SAMPLE ROW 2 DATA (for verification)');
    Logger.log('========================================');
    var rowData = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    rowData.forEach(function(val, i) {
      var display = val instanceof Date ? val.toLocaleString() : String(val).substring(0, 80);
      Logger.log('Col ' + columnIndexToLetter(i) + ' (index ' + i + '): ' + display);
    });
  }
}

function columnIndexToLetter(index) {
  if (index < 0) return '?';
  var letter = '';
  var n = index + 1;
  while (n > 0) {
    var mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * RE-ANALYZE a specific row.
 * Change ROW_NUMBER to the row you want to retry.
 * Untuk mengejar BANYAK baris sekaligus, jangan pakai ini — pakai startBackfill().
 */
function reanalyzeRow() {
  var ROW_NUMBER = 2; // ← Change this

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found'); return; }
  if (ROW_NUMBER < 2) { Logger.log('Row must be >= 2'); return; }

  onFormSubmit({ range: sheet.getRange(ROW_NUMBER, 1) });
  Logger.log('Re-analysis complete for row ' + ROW_NUMBER);
}

/**
 * VERIFY API KEY — run to confirm your Anthropic key works.
 */
function checkApiKey() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey || apiKey.trim() === '') {
    Logger.log('❌ ANTHROPIC_API_KEY tidak ditemukan di Script Properties.'); return;
  }
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: MODEL, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    muteHttpExceptions: true,
  });
  Logger.log(response.getResponseCode() === 200 ? '✅ API Key valid!' : '❌ Error: ' + response.getContentText().substring(0, 200));
}

/**
 * Re-runs analysis on ALL rows showing ❌ Gagal.
 * Run this after topping up your API tokens, atau setelah startBackfill() selesai.
 * If you have many failed rows, run it multiple times — it picks up where it left off.
 */
function reanalyzeAllFailed() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FORM_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found'); return; }

  var cols      = detectFormColumns(sheet);
  var statusCol = getFormColCount(sheet, cols) + 1; // 1-indexed
  var lastRow   = sheet.getLastRow();
  var startTime = new Date().getTime();
  var MAX_MS    = 5 * 60 * 1000; // stop at 5 min (Apps Script hard-kills at 6 min)

  // Collect all failed row numbers in one read (fast)
  var statuses = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
  var failed   = [];
  for (var i = 0; i < statuses.length; i++) {
    if (String(statuses[i][0]).includes('Gagal')) {
      failed.push(i + 2); // +2 = skip header, 1-indexed
    }
  }

  Logger.log('Found ' + failed.length + ' failed rows: ' + failed.join(', '));
  if (failed.length === 0) { Logger.log('✅ No failed rows — all done!'); return; }

  var processed = 0;
  for (var j = 0; j < failed.length; j++) {

    // Stop before hitting the 6-minute execution limit
    if (new Date().getTime() - startTime > MAX_MS) {
      Logger.log('⏰ Time limit reached. Processed ' + processed + '/' + failed.length +
                 ' rows. Run reanalyzeAllFailed() again to continue.');
      return;
    }

    var row = failed[j];
    Logger.log('Re-analyzing row ' + row + ' (' + (j+1) + '/' + failed.length + ')...');

    try {
      onFormSubmit({ range: sheet.getRange(row, 1) });
      processed++;
      Utilities.sleep(1000); // 1s pause — avoids hitting API rate limits
    } catch (err) {
      Logger.log('❌ Row ' + row + ' failed again: ' + err.message);
    }
  }

  Logger.log('✅ Done. Processed ' + processed + '/' + failed.length + ' failed rows.');
}


// ################################################################################
// ##                                                                            ##
// ##   BACKFILL MODULE — mengejar baris yang tertinggal, otomatis sampai habis   ##
// ##                                                                            ##
// ##   startBackfill()   ▶ jalankan sekali, sisanya otomatis                     ##
// ##   backfillStatus()  📊 cek progres kapan saja (aman, tidak mengganggu)      ##
// ##   stopBackfill()    ⏹ hentikan di tengah jalan                             ##
// ##                                                                            ##
// ##   Bedanya dengan reanalyzeAllFailed():                                     ##
// ##   - reanalyzeAllFailed → hanya baris berstatus "❌ Gagal"                   ##
// ##   - startBackfill      → baris berstatus KOSONG + yang nyangkut di "⏳"     ##
// ##                                                                            ##
// ################################################################################


// ── KONFIGURASI BACKFILL ──────────────────────────────────────────────────────
var BF_HANDLER      = 'backfillPendingRows';
var BF_RUN_KEY      = 'BACKFILL_RUN_COUNT';
var BF_MAX_RUNS     = 150;                 // pengaman: berhenti otomatis setelah 150 run
var BF_BUDGET_MS    = 3.5 * 60 * 1000;     // hanya mulai baris baru jika < 3,5 menit
var BF_INSURANCE_MS = 6.5 * 60 * 1000;     // jaring pengaman kalau run dibunuh Google
var BF_NEXT_MS      = 1   * 60 * 1000;     // jeda normal antar run
var BF_SLEEP_MS     = 1500;                // jeda antar baris (hindari rate limit)


/**
 * ▶ JALANKAN INI SEKALI SAJA.
 * Setelah itu script membangunkan dirinya sendiri sampai semua baris terisi.
 * Run pertama akan meminta otorisasi baru (izin mengelola trigger) — itu normal.
 */
function startBackfill() {
  PropertiesService.getScriptProperties().setProperty(BF_RUN_KEY, '0');
  clearBackfillTriggers();
  Logger.log('▶ Backfill dimulai...');
  backfillPendingRows();
}


/**
 * ⏹ HENTIKAN KAPAN SAJA.
 * Baris yang sudah selesai tetap tersimpan. startBackfill() lagi untuk melanjutkan.
 */
function stopBackfill() {
  clearBackfillTriggers();
  Logger.log('⏹ Backfill dihentikan. Baris yang sudah selesai tetap tersimpan.');
  Logger.log('   Jalankan startBackfill() lagi untuk melanjutkan dari sisa baris.');
}


/**
 * 📊 CEK PROGRES — aman dijalankan kapan saja, tidak mengganggu backfill berjalan.
 */
function backfillStatus() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORM_SHEET_NAME);
  if (!sheet) { Logger.log('❌ Sheet "' + FORM_SHEET_NAME + '" tidak ditemukan.'); return; }

  var p       = findPendingRows(sheet);
  var lastRow = sheet.getLastRow();
  var total   = lastRow - 1;
  var runs    = PropertiesService.getScriptProperties().getProperty(BF_RUN_KEY) || '0';
  var active  = ScriptApp.getProjectTriggers().filter(function(t) {
                  return t.getHandlerFunction() === BF_HANDLER;
                }).length > 0;

  Logger.log('========================================');
  Logger.log('STATUS BACKFILL');
  Logger.log('========================================');
  Logger.log('Total baris data      : ' + total);
  Logger.log('Sudah dianalisis      : ' + (total - p.rows.length));
  Logger.log('Sisa pending          : ' + p.rows.length +
             '  (kosong: ' + p.blank + ', nyangkut ⏳: ' + p.stuck + ')');
  Logger.log('Run terpakai          : ' + runs + ' / ' + BF_MAX_RUNS);
  Logger.log('Trigger aktif         : ' + (active ? 'YA — backfill masih berjalan' : 'TIDAK'));
  if (p.rows.length > 0) {
    Logger.log('Baris pending pertama : ' + p.rows[0]);
    Logger.log('Baris pending terakhir: ' + p.rows[p.rows.length - 1]);
  }
}


/**
 * MESIN BACKFILL — dipanggil otomatis oleh trigger.
 * Tidak perlu dijalankan manual; pakai startBackfill().
 */
function backfillPendingRows() {
  var t0    = new Date().getTime();
  var props = PropertiesService.getScriptProperties();
  var run   = parseInt(props.getProperty(BF_RUN_KEY) || '0', 10) + 1;
  props.setProperty(BF_RUN_KEY, String(run));

  clearBackfillTriggers();  // buang trigger yang memanggil run ini

  if (run > BF_MAX_RUNS) {
    Logger.log('🛑 Batas ' + BF_MAX_RUNS + ' run tercapai — backfill dihentikan sebagai pengaman.');
    Logger.log('   Cek backfillStatus(). Kalau memang masih ada sisa, jalankan startBackfill() lagi.');
    return;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FORM_SHEET_NAME);
  if (!sheet) { Logger.log('❌ Sheet "' + FORM_SHEET_NAME + '" tidak ditemukan.'); return; }

  var cols      = detectFormColumns(sheet);
  var statusCol = getFormColCount(sheet, cols) + 1;   // 1-indexed
  var pending   = findPendingRows(sheet).rows;

  Logger.log('=== BACKFILL run #' + run + ' — sisa ' + pending.length + ' baris ===');

  if (pending.length === 0) {
    Logger.log('✅ SELESAI — semua baris sudah dianalisis. Tidak ada trigger tersisa.');
    return;
  }

  // Jaring pengaman: kalau run ini dibunuh Google di tengah jalan (limit 6 menit),
  // trigger ini tetap membangunkan run berikutnya.
  scheduleBackfill(BF_INSURANCE_MS);

  var done = 0;
  for (var i = 0; i < pending.length; i++) {
    if (new Date().getTime() - t0 > BF_BUDGET_MS) break;

    var row = pending[i];
    try {
      onFormSubmit({ range: sheet.getRange(row, 1) });
      done++;
      Logger.log('  ✓ row ' + row);
    } catch (err) {
      // Tandai gagal supaya tidak diulang terus-menerus di run berikutnya
      Logger.log('  ✗ row ' + row + ' → ' + err.message);
      sheet.getRange(row, statusCol).setValue('❌ Gagal — lihat Error Log');
      sheet.getRange(row, statusCol + TOTAL_ANALYSIS_COLS - 1).setValue(err.message);
    }
    Utilities.sleep(BF_SLEEP_MS);
  }

  var sisa = pending.length - done;
  Logger.log('Run #' + run + ': ' + done + ' baris diproses, sisa ' + sisa + '.');

  clearBackfillTriggers();  // buang jaring pengaman, ganti jadwal normal
  if (sisa > 0) {
    scheduleBackfill(BF_NEXT_MS);
    Logger.log('⏭ Run berikutnya otomatis dalam ' + (BF_NEXT_MS / 60000) + ' menit.');
  } else {
    Logger.log('✅ SELESAI — semua baris sudah dianalisis.');
  }
}

/**
 * Cari baris yang statusnya KOSONG (belum pernah jalan) atau NYANGKUT di ⏳
 * (run sebelumnya mati di tengah proses).
 */
function findPendingRows(sheet) {
  var cols      = detectFormColumns(sheet);
  var statusCol = getFormColCount(sheet, cols) + 1;
  var lastRow   = sheet.getLastRow();
  if (lastRow < 2) return { rows: [], blank: 0, stuck: 0 };

  var statuses = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
  var rows = [], blank = 0, stuck = 0;

  for (var i = 0; i < statuses.length; i++) {
    var s = String(statuses[i][0]).trim();
    if (s === '')                  { rows.push(i + 2); blank++; }
    else if (s.charAt(0) === '⏳') { rows.push(i + 2); stuck++; }
  }
  return { rows: rows, blank: blank, stuck: stuck };
}

function clearBackfillTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === BF_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function scheduleBackfill(delayMs) {
  ScriptApp.newTrigger(BF_HANDLER).timeBased().after(delayMs).create();
}