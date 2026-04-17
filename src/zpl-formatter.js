/**
 * 상품 데이터 → ZPL II 문자열 변환
 * 3종 라벨 타입: 50x25 simple, 50x25 doble, 100x25 cartulina (좌우 복제)
 * 가격 1~3개 지원, 요소별 위치/크기 커스텀
 *
 * 203dpi 기준: 1mm ≈ 8dot
 *   50mm = 400dot, 25mm = 200dot, 100mm = 800dot
 */

// ── 라벨 프리셋 ──────────────────────────────────────────────────────────
const LABEL_PRESETS = {
  // 50x25mm 단면
  '50x25-simple': {
    key: '50x25-simple',
    name: '50 x 25mm (Simple)',
    width: 400,
    height: 200,
    duplicate: false,
    layout: {
      name:    { x: 10, y: 5,   fontSize: 22 },
      barcode: { x: 10, y: 30,  height: 50, moduleWidth: 2 },
      price1:  { x: 10, y: 100, fontSize: 28, bold: true },
      price2:  { x: 10, y: 130, fontSize: 20, bold: false },
      price3:  { x: 10, y: 155, fontSize: 20, bold: false },
    },
  },

  // 50x25mm 양면 (doble fase — 같은 크기, 다른 배치)
  '50x25-doble': {
    key: '50x25-doble',
    name: '50 x 25mm (Doble Fase)',
    width: 400,
    height: 200,
    duplicate: false,
    layout: {
      name:    { x: 10, y: 5,   fontSize: 20 },
      barcode: { x: 120, y: 30, height: 45, moduleWidth: 2 },
      price1:  { x: 10, y: 30,  fontSize: 32, bold: true },
      price2:  { x: 10, y: 70,  fontSize: 18, bold: false },
      price3:  { x: 10, y: 95,  fontSize: 18, bold: false },
    },
  },

  // 100x25mm 카르투리나 — 무조건 좌우 복제 (왼편 + 오른편 동일 내용)
  '100x25-cartulina': {
    key: '100x25-cartulina',
    name: '100 x 25mm (Cartulina)',
    width: 800,
    height: 200,
    duplicate: true,         // 좌우 복제 플래그
    halfWidth: 400,          // 절반 너비 (각 복제본 영역)
    layout: {
      name:    { x: 10, y: 5,   fontSize: 20 },
      barcode: { x: 10, y: 30,  height: 45, moduleWidth: 2 },
      price1:  { x: 10, y: 95,  fontSize: 26, bold: true },
      price2:  { x: 10, y: 125, fontSize: 18, bold: false },
      price3:  { x: 10, y: 150, fontSize: 18, bold: false },
    },
  },
};

// ── 바코드 타입별 ZPL 명령 ───────────────────────────────────────────────
const BARCODE_COMMANDS = {
  CODE128: (x, y, value, h, mw) =>
    `^FO${x},${y}^BY${mw}^BCN,${h},Y,N,N^FD${value}^FS`,
  EAN13: (x, y, value, h, mw) =>
    `^FO${x},${y}^BY${mw}^BEN,${h},Y,N^FD${value}^FS`,
  QR: (x, y, value) =>
    `^FO${x},${y}^BQN,2,4^FDQA,${value}^FS`,
};

/**
 * 가격 포맷 (아르헨 형식)
 * @param {number|string} amount
 * @returns {string}
 */
function formatPrice(amount) {
  if (amount == null || amount === '') return '';
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return '';

  return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

/**
 * 단일 복제본 ZPL 라인 생성 (오프셋 적용 가능)
 * @param {Object} item - { name, sku, barcodeType, prices: [{ label, amount }] }
 * @param {Object} layout - 위치/크기 설정
 * @param {number} offsetX - X축 오프셋 (100mm 라벨 오른쪽 복제본용)
 * @returns {string[]} ZPL 라인 배열
 */
function renderCopy(item, layout, offsetX = 0) {
  const lines = [];
  const barcodeType = (item.barcodeType || 'CODE128').toUpperCase();
  const barcodeCmd = BARCODE_COMMANDS[barcodeType] || BARCODE_COMMANDS.CODE128;

  // 상품명
  const nm = layout.name;
  lines.push(`^FO${nm.x + offsetX},${nm.y}^A0N,${nm.fontSize},${nm.fontSize}^FD${sanitize(item.name || '')}^FS`);

  // 바코드 (SKU를 바코드 값으로 사용)
  const bc = layout.barcode;
  const barcodeValue = item.sku || item.barcode || '';
  if (barcodeValue) {
    lines.push(barcodeCmd(bc.x + offsetX, bc.y, barcodeValue, bc.height, bc.moduleWidth || 2));
  }

  // 가격 1~3개
  const prices = item.prices || [];
  for (let i = 0; i < 3; i++) {
    const priceSlot = layout[`price${i + 1}`];
    if (!priceSlot) continue;

    const priceData = prices[i];
    if (!priceData) continue;

    const priceText = priceData.label
      ? `${priceData.label}: ${formatPrice(priceData.amount)}`
      : formatPrice(priceData.amount);

    if (!priceText) continue;

    // bold 처리: 폰트 크기를 약간 키워서 강조
    const fs = priceSlot.bold ? priceSlot.fontSize : priceSlot.fontSize;
    const fw = priceSlot.bold ? Math.round(fs * 1.2) : fs;
    lines.push(`^FO${priceSlot.x + offsetX},${priceSlot.y}^A0N,${fs},${fw}^FD${sanitize(priceText)}^FS`);
  }

  return lines;
}

/**
 * 단일 상품 라벨 ZPL 생성
 * @param {Object} item - { name, sku, barcodeType, prices: [{ label, amount }] }
 * @param {Object} preset - LABEL_PRESETS 중 하나 (또는 커스텀 layout 포함 객체)
 * @returns {string} ZPL 문자열
 */
function formatLabel(item, preset) {
  const p = preset || LABEL_PRESETS['50x25-simple'];
  const layout = p.layout;

  const lines = [
    '^XA',
    `^PW${p.width}`,
    `^LL${p.height}`,
    '^CI28',
  ];

  // 왼쪽 (또는 단일) 복제본
  lines.push(...renderCopy(item, layout, 0));

  // 100x25 cartulina: 오른쪽 복제본
  if (p.duplicate && p.halfWidth) {
    lines.push(...renderCopy(item, layout, p.halfWidth));
  }

  lines.push('^XZ');

  return lines.join('\n');
}

/**
 * 여러 상품 라벨 일괄 생성 (qty 반복 포함)
 * @param {Array} items - [{ name, sku, barcodeType, prices, qty }]
 * @param {Object} preset - 라벨 프리셋
 * @returns {string} 전체 ZPL 문자열
 */
function formatBatchLabels(items, preset) {
  const labels = [];

  for (const item of items) {
    const qty = Math.max(1, item.qty || 1);
    const zpl = formatLabel(item, preset);

    for (let i = 0; i < qty; i++) {
      labels.push(zpl);
    }
  }

  return labels.join('\n');
}

// ZPL 특수문자 이스케이프
function sanitize(str) {
  return String(str).replace(/[\^~]/g, '');
}

module.exports = {
  formatLabel,
  formatBatchLabels,
  LABEL_PRESETS,

  // 하위 호환
  formatBarcodeLabel: formatLabel,
};
