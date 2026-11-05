import React, { useState, useEffect } from 'react';

const HOST_NAME = 'com.portkiller.host';

const PRESET_PORTS = [
  { port: 3000, label: 'React / Next.js / NestJS', tag: 'Web' },
  { port: 5173, label: 'Vite / Vue / Svelte', tag: 'Vite' },
  { port: 8080, label: 'Java / Spring / Tomcat', tag: 'Backend' },
  { port: 5432, label: 'PostgreSQL Database', tag: 'Database' },
  { port: 3306, label: 'MySQL / MariaDB', tag: 'Database' },
  { port: 8000, label: 'Python / Django / FastAPI', tag: 'API' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'presets' | 'game'
  const [activePorts, setActivePorts] = useState([]);
  const [filterDevOnly, setFilterDevOnly] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanConfirm, setCleanConfirm] = useState(false);

  const [customPort, setCustomPort] = useState('');
  const [loadingMap, setLoadingMap] = useState({});
  const [logs, setLogs] = useState([]);
  const [hostStatus, setHostStatus] = useState('checking'); // checking | connected | error
  const [hostError, setHostError] = useState(null);
  const [extensionId, setExtensionId] = useState('');

  const addLog = (type, message) => {
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setLogs((prev) => [{ id: Date.now() + Math.random(), time: timeStr, type, message }, ...prev.slice(0, 39)]);
  };

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      setExtensionId(chrome.runtime.id);
    }
  }, []);

  const sendNative = (payload) => {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
        return reject(new Error('chrome.runtime.sendNativeMessage không khả dụng.'));
      }
      chrome.runtime.sendNativeMessage(HOST_NAME, payload, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response) {
          return reject(new Error('Host không trả về dữ liệu (stdin/stdout kết thúc đột ngột).'));
        }
        resolve(response);
      });
    });
  };

  // Ping & Auto Scan
  const checkHostConnection = async () => {
    setHostStatus('checking');
    try {
      const res = await sendNative({ action: 'ping' });
      if (res?.success) {
        setHostStatus('connected');
        setHostError(null);
        addLog('success', `Host đã sẵn sàng (Node ${res.nodeVersion})`);
        // Auto scan active ports
        scanActivePorts();
      } else {
        throw new Error(res?.error || 'Phản hồi không xác định.');
      }
    } catch (err) {
      setHostStatus('error');
      setHostError(err.message);
      addLog('error', `Lỗi kết nối Host: ${err.message}`);
    }
  };

  useEffect(() => {
    checkHostConnection();
  }, []);

  // Scan all active ports on Windows
  const scanActivePorts = async () => {
    setIsScanning(true);
    addLog('info', 'Đang quét tất cả các cổng đang mở trên Windows...');
    try {
      const res = await sendNative({ action: 'scan' });
      if (res?.success) {
        setActivePorts(res.ports || []);
        addLog('success', `Quét xong: Tìm thấy ${res.total} cổng mở (${res.devCount} tiến trình dev).`);
      } else {
        addLog('error', `Không thể quét: ${res?.error}`);
      }
    } catch (err) {
      addLog('error', `Lỗi quét cổng: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const setPortLoading = (port, isLoading) => {
    setLoadingMap((prev) => ({ ...prev, [port]: isLoading }));
  };

  // Kill port
  const handleKillPort = async (port, procName = '') => {
    const p = parseInt(port, 10);
    if (isNaN(p) || p < 1 || p > 65535) {
      addLog('warning', `Port ${port} không hợp lệ (1-65535).`);
      return;
    }

    setPortLoading(p, true);
    addLog('info', `Đang đóng cổng :${p}${procName ? ` (${procName})` : ''}...`);

    try {
      const res = await sendNative({ action: 'kill', port: p });
      if (res.success) {
        if (res.killed?.length > 0) {
          const detail = res.killed.map((k) => `${k.name} [PID: ${k.pid}]`).join(', ');
          addLog('success', `Đã giải phóng :${p}! Tắt thành công: ${detail}`);
        } else {
          addLog('info', res.message || `Cổng :${p} đã trống.`);
        }
        // Remove killed port from activePorts state
        setActivePorts((prev) => prev.filter((item) => item.port !== p));
      } else {
        addLog('error', `Lỗi giải phóng :${p}: ${res.error || res.message}`);
      }
    } catch (err) {
      addLog('error', `Lỗi gửi lệnh kill: ${err.message}`);
    } finally {
      setPortLoading(p, false);
    }
  };

  // Clean all / Game Mode
  const handleCleanAll = async (devOnly = true) => {
    setIsCleaning(true);
    addLog(
      'info',
      devOnly
        ? '🎮 Chế độ Game: Đang đóng tất cả các tiến trình dev...'
        : '🧹 Đang dọn dẹp tất cả các cổng mạng người dùng...'
    );

    try {
      const res = await sendNative({ action: 'kill_all', devOnly });
      if (res?.success) {
        if (res.killedCount > 0) {
          const names = res.killed
            .filter((k) => k.success)
            .map((k) => `${k.name} [PID: ${k.pid}]`)
            .join(', ');
          addLog(
            'success',
            `🎮 Dọn dẹp hoàn tất! Đã tắt ${res.killedCount} tiến trình (${names}), giải phóng ${res.freedPortsCount} cổng.`
          );
        } else {
          addLog('info', res.message || 'Không có tiến trình nào cần tắt.');
        }
        await scanActivePorts();
      } else {
        addLog('error', `Lỗi dọn dẹp: ${res?.error || res?.message}`);
      }
    } catch (err) {
      addLog('error', `Lỗi gửi lệnh dọn dẹp: ${err.message}`);
    } finally {
      setIsCleaning(false);
      setCleanConfirm(false);
    }
  };

  const displayedPorts = filterDevOnly
    ? activePorts.filter((p) => p.isDev)
    : activePorts;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-icon">⚡</div>
          <div>
            <div className="brand-title">Port Killer</div>
            <div className="brand-subtitle">Windows DevPort Manager</div>
          </div>
        </div>

        <div
          className={`host-badge ${hostStatus}`}
          onClick={checkHostConnection}
          title="Bấm để kiểm tra lại kết nối"
        >
          <span className="badge-dot" />
          <span>{hostStatus === 'connected' ? 'Host Ready' : 'Host Error'}</span>
        </div>
      </header>

      {/* Host Error Notice */}
      {hostStatus === 'error' && (
        <div className="host-error-banner">
          <div className="host-error-title">⚠️ Không tìm thấy Native Messaging Host</div>
          <div className="host-error-desc">
            Trình duyệt không tìm thấy file cấu hình host hoặc Registry chưa được cập nhật theo thư mục mới.
          </div>
          {extensionId && (
            <div className="host-error-id-row">
              <span className="host-error-id-label">Extension ID:</span>
              <code className="host-error-id-code">{extensionId}</code>
              <button
                className="btn-copy-id"
                onClick={() => {
                  navigator.clipboard.writeText(extensionId);
                  addLog('info', `Đã sao chép Extension ID: ${extensionId}`);
                }}
              >
                Copy ID
              </button>
            </div>
          )}
          <div className="host-error-actions">
            <span>
              Chạy <b>scripts\install_host.bat</b> hoặc click đúp <b>register.reg</b>.
            </span>
            <button className="btn btn-primary btn-sm" onClick={checkHostConnection}>
              🔄 Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <span>🔍 Cổng đang mở</span>
          <span className="tab-badge">
            {activePorts.filter((p) => p.isDev).length} dev
          </span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'game' ? 'active' : ''}`}
          onClick={() => setActiveTab('game')}
        >
          <span>🎮 Chế độ Game</span>
          {activePorts.filter((p) => p.isDev).length > 0 && (
            <span className="tab-badge badge-warning">
              {activePorts.filter((p) => p.isDev).length}
            </span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === 'presets' ? 'active' : ''}`}
          onClick={() => setActiveTab('presets')}
        >
          <span>⚡ Phổ biến</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE PORTS SCANNER */}
      {activeTab === 'active' && (
        <section className="card-section">
          <div className="scan-controls">
            <div className="filter-pills">
              <button
                className={`pill-btn ${filterDevOnly ? 'active' : ''}`}
                onClick={() => setFilterDevOnly(true)}
              >
                Chỉ Dev Tools ({activePorts.filter((p) => p.isDev).length})
              </button>
              <button
                className={`pill-btn ${!filterDevOnly ? 'active' : ''}`}
                onClick={() => setFilterDevOnly(false)}
              >
                Tất cả ({activePorts.length})
              </button>
            </div>

            <button
              className="btn btn-primary btn-sm"
              disabled={isScanning}
              onClick={scanActivePorts}
            >
              {isScanning ? <span className="spinner" /> : '🔄 Quét lại'}
            </button>
          </div>

          {/* Quick Clean Bar */}
          {activePorts.filter((p) => p.isDev).length > 0 && (
            <div className="quick-clean-bar">
              <div className="quick-clean-text">
                <span>🎮</span>
                <span>
                  Có <b>{activePorts.filter((p) => p.isDev).length}</b> server dev đang chạy ngầm
                </span>
              </div>
              <button
                className="btn btn-warning btn-xs"
                disabled={isCleaning}
                onClick={() => {
                  if (
                    window.confirm(
                      `Xác nhận tắt toàn bộ ${
                        activePorts.filter((p) => p.isDev).length
                      } tiến trình dev để giải phóng máy?`
                    )
                  ) {
                    handleCleanAll(true);
                  }
                }}
              >
                {isCleaning ? <span className="spinner" /> : '⚡ Tắt hết'}
              </button>
            </div>
          )}

          <div className="active-ports-list">
            {displayedPorts.length === 0 ? (
              <div className="empty-state">
                <div>🎉 Không có cổng nào đang bị chiếm!</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  Máy tính của bạn đang sạch sẽ hoặc chưa có dev server nào chạy.
                </div>
              </div>
            ) : (
              displayedPorts.map((item) => (
                <div
                  key={`${item.port}-${item.pid}`}
                  className={`active-port-item ${item.isDev ? 'is-dev' : ''}`}
                >
                  <div className="active-port-info">
                    <span className="port-number-badge">:{item.port}</span>
                    <span className="proc-name-badge">{item.name}</span>
                    <span className="proc-pid">PID {item.pid}</span>
                    {item.isDev && <span className="tag-dev">DEV</span>}
                  </div>

                  <button
                    className="btn btn-danger btn-sm"
                    disabled={loadingMap[item.port]}
                    onClick={() => handleKillPort(item.port, item.name)}
                  >
                    {loadingMap[item.port] ? <span className="spinner" /> : 'Kill'}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 2: GAME MODE CLEANER */}
      {activeTab === 'game' && (
        <section className="card-section game-mode-container">
          <div className="game-hero">
            <div className="game-hero-icon">🎮</div>
            <div>
              <div className="game-hero-title">Tối ưu máy tính trước khi chơi Game</div>
              <div className="game-hero-desc">
                Đóng tất cả các server dev (Node, Vite, Python, Java, Docker...) đang chạy ngầm để giải phóng RAM, CPU và giảm giật lag.
              </div>
            </div>
          </div>

          <div className="game-stats-card">
            <div className="game-stat-item">
              <span className="game-stat-num">
                {activePorts.filter((p) => p.isDev).length}
              </span>
              <span className="game-stat-label">Tiến trình Dev</span>
            </div>
            <div className="game-stat-item">
              <span className="game-stat-num">{activePorts.length}</span>
              <span className="game-stat-label">Tổng cổng mở</span>
            </div>
            <div className="game-stat-item">
              <span
                className="game-stat-num"
                style={{
                  color:
                    activePorts.filter((p) => p.isDev).length > 0
                      ? 'var(--accent-amber)'
                      : 'var(--accent-green)'
                }}
              >
                {activePorts.filter((p) => p.isDev).length > 0 ? 'Cần tắt' : 'Tối ưu'}
              </span>
              <span className="game-stat-label">Trạng thái</span>
            </div>
          </div>

          {activePorts.filter((p) => p.isDev).length > 0 ? (
            <div className="game-detected-box">
              <div className="game-box-title">Đang phát hiện các server ngầm:</div>
              <div className="game-detected-chips">
                {Array.from(
                  new Set(
                    activePorts
                      .filter((p) => p.isDev)
                      .map((p) => `${p.name} (:${p.port})`)
                  )
                ).map((item, idx) => (
                  <span key={idx} className="game-proc-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="game-clean-state">
              <span>🎉</span>
              <span>
                Không có server dev nào chạy ngầm! Máy tính sẵn sàng chiến game mượt mà.
              </span>
            </div>
          )}

          <div className="game-actions">
            <button
              className="btn btn-game-primary btn-block"
              disabled={isCleaning || activePorts.filter((p) => p.isDev).length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    `Xác nhận tắt toàn bộ ${
                      activePorts.filter((p) => p.isDev).length
                    } tiến trình dev để giải phóng tài nguyên chơi game?`
                  )
                ) {
                  handleCleanAll(true);
                }
              }}
            >
              {isCleaning ? <span className="spinner" /> : '🚀 TẮT HẾT DEV SERVER (KHUYÊN DÙNG)'}
            </button>

            <button
              className="btn btn-secondary btn-block btn-sm"
              disabled={isCleaning || activePorts.length === 0}
              onClick={() => {
                if (
                  window.confirm(
                    'Cảnh báo: Lệnh này sẽ đóng toàn bộ các cổng mạng người dùng (đã loại trừ hệ thống Windows). Tiếp tục?'
                  )
                ) {
                  handleCleanAll(false);
                }
              }}
            >
              {isCleaning ? <span className="spinner" /> : '🧹 Dọn dẹp sâu (Tắt tất cả cổng người dùng)'}
            </button>
          </div>

          <div className="game-safety-note">
            <span>🛡️</span>
            <span>
              <b>An toàn tuyệt đối:</b> Hệ thống tự động bảo vệ các tiến trình cốt lõi của Windows (System, Explorer, DWM, svchost...) và trình duyệt web.
            </span>
          </div>
        </section>
      )}

      {/* TAB 3: PRESETS & CUSTOM PORT */}
      {activeTab === 'presets' && (
        <>
          {/* Custom Port Row */}
          <section className="card-section">
            <div className="section-label">Giải phóng cổng tùy chọn</div>
            <div className="custom-port-row">
              <div className="port-input-wrapper">
                <input
                  type="number"
                  className="port-input"
                  placeholder="Nhập port (VD: 3000, 8080)..."
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && customPort && handleKillPort(customPort)}
                />
              </div>
              <button
                className="btn btn-danger"
                disabled={!customPort || loadingMap[customPort]}
                onClick={() => handleKillPort(customPort)}
              >
                {loadingMap[customPort] ? <span className="spinner" /> : 'Kill Port'}
              </button>
            </div>
          </section>

          {/* Preset Grid */}
          <section className="card-section">
            <div className="section-label">Cổng dev hay kẹt</div>
            <div className="presets-grid">
              {PRESET_PORTS.map(({ port, label, tag }) => (
                <div key={port} className="preset-card">
                  <div>
                    <div className="preset-header">
                      <span className="preset-port">:{port}</span>
                      <span className="preset-tag">{tag}</span>
                    </div>
                    <div className="preset-desc" title={label}>{label}</div>
                  </div>
                  <div className="preset-actions">
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={loadingMap[port]}
                      onClick={() => handleKillPort(port)}
                    >
                      {loadingMap[port] ? <span className="spinner" /> : 'Kill'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Activity Log */}
      <section className="log-card">
        <div className="log-header">
          <span className="log-title">Nhật ký hoạt động</span>
          {logs.length > 0 && (
            <button className="btn-text" onClick={() => setLogs([])}>
              Xóa log
            </button>
          )}
        </div>
        <div className="log-container">
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
              Chưa có hoạt động nào.
            </div>
          ) : (
            logs.map((item) => (
              <div key={item.id} className={`log-item ${item.type}`}>
                <span className="log-time">[{item.time}]</span>
                <span>{item.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
