// ===== pic.js — Item Image Display =====
// ค้นหารูปภาพไอเทมจาก 5etools-img และ homebrew-img บน GitHub
// แล้วแสดงต่อจาก Source ในแถวรายละเอียดไอเทม

(function () {
  'use strict';

  // === Primary Source: 5etools-mirror-3 ===
  const PRIMARY_BASE = 'https://raw.githubusercontent.com/aKittyCat/5etools-img/refs/heads/main/items';

  // === Fallback Source: homebrew-img (ใช้ Trees API ค้นหา) ===
  const HOMEBREW_RAW_BASE = 'https://raw.githubusercontent.com/TheGiddyLimit/homebrew-img/refs/heads/main';
  const HOMEBREW_TREE_API = 'https://api.github.com/repos/TheGiddyLimit/homebrew-img/git/trees/main?recursive=1';

  // === Cache ===
  const _cache = new Map(); // key => url | null
  let _homebrewTree = null;
  let _homebrewTreePromise = null;

  function _cacheKey(book, name) {
    return `${book}||${name}`;
  }

  /**
   * ดึงชื่อย่อหนังสือจากข้อความ source เช่น
   *   "DMG, p.155" → "DMG"
   *   "PHB p.200"  → "PHB"
   */
  function _extractBookAbbrev(raw) {
    if (!raw) return '';
    return raw.replace(/[,;]\s*.*/g, '')
      .replace(/\s+p\.\s*\d.*/gi, '')
      .trim();
  }

  /**
   * แปลงชื่อไอเทมเป็น title case มาตรฐาน
   * "Boots Of Elvenkind" → "Boots of Elvenkind"
   */
  const SMALL_WORDS = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'if', 'in',
    'into', 'nor', 'of', 'on', 'or', 'out', 'so', 'the', 'to', 'up', 'vs', 'with', 'yet'
  ]);

  function _normalizeItemName(name) {
    if (!name) return '';
    return name.trim().split(/\s+/).map((word, i) => {
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      const lower = word.toLowerCase();
      if (SMALL_WORDS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  /**
   * แปลงชื่อเป็น lowercase-hyphenated สำหรับ homebrew search
   * "Flying Broomstick" → "flying-broomstick"
   */
  function _toHyphenated(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  }

  /**
   * ตัดส่วนวงเล็บท้ายชื่อออก เช่น
   * "Cartographer's Map Case (Max Rank)" → "Cartographer's Map Case"
   * "Living Loot Satchel (Awakened)" → "Living Loot Satchel"
   */
  function _stripParenSuffix(name) {
    return name.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  }

  /**
   * ลองโหลดรูปจาก URL ที่ให้มา
   */
  function _probe(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /**
   * โหลด file tree ของ homebrew-img repo (ครั้งเดียว แล้ว cache)
   */
  async function _loadHomebrewTree() {
    if (_homebrewTree) return _homebrewTree;
    if (_homebrewTreePromise) return _homebrewTreePromise;

    _homebrewTreePromise = (async () => {
      try {
        const resp = await fetch(HOMEBREW_TREE_API);
        if (!resp.ok) return [];
        const data = await resp.json();
        _homebrewTree = (data.tree || [])
          .filter(n => n.type === 'blob' && /\.(webp|png|jpg|jpeg)$/i.test(n.path))
          .map(n => n.path);
        return _homebrewTree;
      } catch (e) {
        console.warn('pic.js: Failed to load homebrew tree', e);
        return [];
      }
    })();

    return _homebrewTreePromise;
  }

  /**
   * ค้นหารูปภาพจาก homebrew-img tree โดยจับคู่ชื่อไฟล์
   */
  async function _findInHomebrew(itemName) {
    const tree = await _loadHomebrewTree();
    if (!tree.length) return null;

    // ลองทั้งชื่อเดิมและชื่อที่ตัด (Dormant) / (Max Rank) ออก
    const raw = itemName.trim();
    const stripped = _stripParenSuffix(raw);
    const candidates = [raw, stripped];

    // สร้าง set ของชื่อที่จะจับคู่ (lowercase)
    const matchSet = new Set();
    for (const c of candidates) {
      matchSet.add(_toHyphenated(c));               // armor-of-the-valiant-soul
      matchSet.add(c.toLowerCase());                 // armor of the valiant soul
      matchSet.add(c.toLowerCase().replace(/\s+/g, '')); // armorofthevaliantsoul
      matchSet.add(c.toLowerCase().replace(/[^a-z0-9]/g, '')); // armorofthevaliantsoul (ไม่มีอักขระพิเศษ)
    }

    for (const path of tree) {
      const filename = path.split('/').pop().replace(/\.[^.]+$/, '');
      const fnLower = filename.toLowerCase();
      if (matchSet.has(fnLower)) {
        const url = `${HOMEBREW_RAW_BASE}/${path}`;
        const result = await _probe(url);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * หา URL รูปภาพที่ใช้ได้สำหรับไอเทม
   * 1. ลองจาก 5etools-img (direct URL)
   * 2. ลองจาก homebrew-img (Tree API search)
   */
  async function findItemImageUrl(itemName, bookSource) {
    if (!itemName || !bookSource) return null;

    const book = _extractBookAbbrev(bookSource);
    if (!book) return null;

    const key = _cacheKey(book, itemName);
    if (_cache.has(key)) return _cache.get(key);

    // === 1. ลองจาก 5etools-img ===
    const normalized = _normalizeItemName(itemName);
    const stripped = _stripParenSuffix(itemName);
    const strippedNorm = _normalizeItemName(stripped);
    const hyphenated = _toHyphenated(stripped);

    // สร้าง list ชื่อทั้งหมดที่จะลอง (ไม่ซ้ำ)
    // รวม variant ที่ตัด apostrophe ด้วย (เช่น Iggwilv's → Iggwilvs)
    const noApostrophe = strippedNorm.replace(/[''`]/g, '');
    const namesToTry = [...new Set([
      normalized,
      itemName.trim(),
      strippedNorm,
      stripped.trim(),
      hyphenated,
      noApostrophe,
      normalized.replace(/[''`]/g, ''),
    ])];

    for (const tryName of namesToTry) {
      const url = `${PRIMARY_BASE}/${encodeURIComponent(book)}/${encodeURIComponent(tryName)}.webp`;
      const result = await _probe(url);
      if (result) {
        _cache.set(key, result);
        return result;
      }
    }

    // === 2. ลองจาก homebrew-img (Tree API search) — ข้ามหนังสือ official ===
    const OFFICIAL_BOOKS = new Set([
      'DMG', 'PHB', 'MM', 'XGE', 'TCE', 'FTD', 'VGM', 'MTF', 'SCAG', 'GGR', 'MOT',
      'EGW', 'ERLW', 'AI', 'WBtW', 'SCC', 'AAG', 'BAM', 'SatO', 'BMT', 'PHB2024',
      'DMG2024', 'MM2024', 'XPHB', 'XDMG', 'XMM',
    ]);
    if (!OFFICIAL_BOOKS.has(book)) {
      const homebrewResult = await _findInHomebrew(itemName);
      if (homebrewResult) {
        _cache.set(key, homebrewResult);
        return homebrewResult;
      }
    }

    _cache.set(key, null);
    return null;
  }

  /**
   * แสดงรูปภาพไอเทมใน container ที่กำหนด
   */
  async function renderItemImage(containerEl, itemName, bookSource) {
    if (!containerEl) return;

    containerEl.innerHTML = `
      <div class="item-img-loading">
        <div class="item-img-spinner"></div>
        <span class="text-gray-500 text-xs">กำลังค้นหารูปภาพ...</span>
      </div>`;

    const url = await findItemImageUrl(itemName, bookSource);

    if (!url) {
      containerEl.innerHTML = '';
      containerEl.style.display = 'none';
      return;
    }

    containerEl.style.display = '';
    containerEl.innerHTML = `
      <div class="item-img-wrapper">
        <img
          src="${url}"
          alt="${itemName}"
          class="item-img"
          loading="lazy"
          onerror="this.parentElement.parentElement.style.display='none'"
        />
      </div>`;
  }

  // === Inject CSS ===
  const style = document.createElement('style');
  style.textContent = `
    /* --- Item Image Styles --- */
    .item-img-container {
      margin-top: 0.75rem;
      display: flex;
      justify-content: center;
    }

    .item-img-wrapper {
      position: relative;
      max-width: 320px;
      max-height: 400px;
      width: 100%;
      border-radius: 1rem;
      overflow: hidden;
      background: rgba(17, 24, 39, 0.6);
      border: 1px solid rgba(139, 92, 246, 0.3);
      box-shadow:
        0 0 20px rgba(139, 92, 246, 0.08),
        0 4px 24px rgba(0, 0, 0, 0.3);
      animation: itemImgFadeIn 0.4s ease-out;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .item-img-wrapper:hover {
      border-color: rgba(139, 92, 246, 0.5);
      box-shadow:
        0 0 30px rgba(139, 92, 246, 0.15),
        0 8px 32px rgba(0, 0, 0, 0.4);
      transform: translateY(-2px);
      transition: all 0.3s ease;
    }

    .item-img {
      width: 100%;
      max-height: 400px;
      display: block;
      object-fit: contain;
      border-radius: 1rem;
    }

    .item-img-loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
    }

    .item-img-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(139, 92, 246, 0.3);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: itemImgSpin 0.6s linear infinite;
    }

    @keyframes itemImgSpin {
      to { transform: rotate(360deg); }
    }

    @keyframes itemImgFadeIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(8px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .item-img-wrapper {
        max-width: 240px;
        max-height: 280px;
      }
      .item-img {
        max-height: 280px;
      }
    }

    @media (max-width: 480px) {
      .item-img-wrapper {
        max-width: 180px;
        max-height: 220px;
        border-radius: 0.75rem;
      }
      .item-img {
        max-height: 220px;
        border-radius: 0.75rem;
      }
    }
  `;
  document.head.appendChild(style);

  // === Expose globally ===
  window.ItemPic = {
    findItemImageUrl,
    renderItemImage,
  };
})();