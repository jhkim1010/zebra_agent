/**
 * Zebra 프린터 전송 모듈
 * - network: TCP Raw Socket (포트 9100)
 * - usb: OS별 raw print 명령 (Windows: PowerShell, macOS/Linux: lp)
 *
 * 보안: execFile 사용 (shell injection 방지)
 */
const net = require('net');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_PORT = 9100;
const CONNECT_TIMEOUT = 5000;

// ── Network (TCP Raw Socket) ────────────────────────────────────────────

function sendZplNetwork(zplString, host, port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    if (!host) {
      resolve({ ok: false, error: 'host requerido' });

      return;
    }

    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECT_TIMEOUT);

    socket.on('timeout', () => {
      console.error(`[ZebraPrinter] timeout ${host}:${port}`);
      finish({ ok: false, error: `timeout ${host}:${port}` });
    });

    socket.on('error', (err) => {
      console.error(`[ZebraPrinter] error ${host}:${port}:`, err.message);
      finish({ ok: false, error: err.message });
    });

    socket.connect(port, host, () => {
      socket.write(zplString, 'utf8', (writeErr) => {
        if (writeErr) {
          console.error(`[ZebraPrinter] write error:`, writeErr.message);
          finish({ ok: false, error: writeErr.message });

          return;
        }

        socket.end(() => {
          finish({ ok: true });
        });
      });
    });
  });
}

function testConnectionNetwork(host, port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

// ── USB (OS별 raw print — execFile로 injection 방지) ────────────────────

/**
 * ZPL을 USB 프린터로 전송
 * @param {string} zplString - ZPL 명령
 * @param {string} printerName - OS에 등록된 프린터 이름
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function sendZplUsb(zplString, printerName) {
  return new Promise((resolve) => {
    if (!printerName) {
      resolve({ ok: false, error: 'printerName requerido' });

      return;
    }

    // 임시 파일에 ZPL 저장
    const tmpFile = path.join(os.tmpdir(), `zebra-zpl-${Date.now()}.zpl`);
    fs.writeFileSync(tmpFile, zplString, 'utf8');

    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: PowerShell — execFile로 인자 분리하여 injection 방지
      const psScript = `Get-Content -Path '${tmpFile.replace(/'/g, "''")}' -Raw -Encoding Byte | Out-Printer -Name '${printerName.replace(/'/g, "''")}'`;
      execFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: 10000 }, (err, stdout, stderr) => {
        cleanup();
        if (err) {
          console.error('[ZebraPrinter USB] win error:', err.message, stderr);
          resolve({ ok: false, error: err.message || stderr });

          return;
        }
        console.log('[ZebraPrinter USB] win ok:', stdout);
        resolve({ ok: true });
      });
    } else {
      // macOS / Linux: lp 명령 (CUPS) — raw 모드
      execFile('lp', ['-d', printerName, '-o', 'raw', tmpFile], { timeout: 10000 }, (err, stdout, stderr) => {
        cleanup();
        if (err) {
          console.error('[ZebraPrinter USB] lp error:', err.message, stderr);
          resolve({ ok: false, error: err.message || stderr });

          return;
        }
        console.log('[ZebraPrinter USB] lp ok:', stdout);
        resolve({ ok: true });
      });
    }
  });
}

/**
 * OS에 등록된 프린터 목록 조회
 * @returns {Promise<string[]>} 프린터 이름 배열
 */
function listUsbPrinters() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        resolve(stdout.split('\n').map(s => s.trim()).filter(Boolean));
      });
    } else {
      // macOS / Linux: lpstat
      execFile('lpstat', ['-p'], { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }

        // lpstat -p 출력: "printer PrinterName is idle." 형식
        const printers = stdout
          .split('\n')
          .map(line => { const m = line.match(/^printer\s+(\S+)/); return m ? m[1] : null; })
          .filter(Boolean);

        resolve(printers);
      });
    }
  });
}

/**
 * USB 프린터 테스트 — 빈 ZPL(상태 조회) 전송
 * @param {string} printerName
 * @returns {Promise<boolean>}
 */
function testConnectionUsb(printerName) {
  return sendZplUsb('^XA^XZ', printerName).then(r => r.ok);
}

// ── 통합 인터페이스 ─────────────────────────────────────────────────────

/**
 * 프린터 설정에 따라 자동 분기
 * @param {string} zplString
 * @param {Object|string} config - { type: 'network'|'usb', host?, port?, printerName? } 또는 host 문자열
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
function sendZpl(zplString, config) {
  // 하위 호환: config가 문자열이면 network host로 처리
  if (typeof config === 'string') {
    return sendZplNetwork(zplString, config);
  }

  if (config.type === 'usb') {
    return sendZplUsb(zplString, config.printerName);
  }

  return sendZplNetwork(zplString, config.host, config.port || DEFAULT_PORT);
}

/**
 * 연결 테스트 (통합)
 * @param {Object|string} config
 * @param {number} [port]
 * @returns {Promise<boolean>}
 */
function testConnection(config, port) {
  // 하위 호환: testConnection('192.168.1.1', 9100)
  if (typeof config === 'string') {
    return testConnectionNetwork(config, port || DEFAULT_PORT);
  }

  if (config.type === 'usb') {
    return testConnectionUsb(config.printerName);
  }

  return testConnectionNetwork(config.host, config.port || DEFAULT_PORT);
}

module.exports = {
  sendZpl,
  testConnection,
  listUsbPrinters,
  sendZplNetwork,
  sendZplUsb,
  DEFAULT_PORT,
};
