# VentaGO Zebra Agent — Release Notes

## v1.0.0 (2026-04-16)

### Funcionalidades
- Impresión de etiquetas con código de barras vía TCP Raw Socket (puerto 9100)
- Soporte para 3 tipos de código: CODE128, EAN13, QR
- Asistente de configuración inicial (3 pasos: servidor, impresora, etiqueta)
- Descubrimiento automático de impresoras en la red local (escaneo puerto 9100)
- Conexión WebSocket persistente con reconexión automática
- Bandeja del sistema (System Tray) con estado de conexión en tiempo real
- Etiqueta configurable: ancho/alto en dots (por defecto 50mm x 30mm a 203dpi)

### Requisitos
- Windows 10+ (64-bit) o macOS 10.15+
- Impresora Zebra con puerto TCP 9100 habilitado
- Conexión a servidor VentaGO

### Instalación
1. Descargar el instalador desde la página de Descargas en VentaGO
2. Ejecutar el instalador
3. Completar el asistente con:
   - URL del servidor (proporcionada por el administrador)
   - API Key (generada desde el panel de administración > Sucursal > Agentes de Impresión)
   - IP de la impresora Zebra (o usar "Buscar impresoras")

### Build
```bash
cd zebra-agent
npm install
npm run build:win   # Windows
npm run build:mac   # macOS
```

### CI/CD
Tag `zebra-agent-v*` en GitHub dispara el workflow `build-zebra-agent.yml` que genera:
- `VentaGO-Zebra-Agent-Setup.exe` (Windows)
- `VentaGO-Zebra-Agent-x64.dmg` (Mac Intel)
- `VentaGO-Zebra-Agent-arm64.dmg` (Mac Apple Silicon)
