<script setup lang="ts">
import { onMounted, ref, onUnmounted, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { AdsbSimulator, AdsbDecoder, type DecodedPosition, type DecodedVelocity } from '../utils/adsb';
import { AdsbRecorder, ReplayEngine, StorageManager, type PlaybackState } from '../utils/recorder';
import type { AircraftState, TrajectoryPoint, AircraftTrajectory } from '../utils/types';

// Tauri API 导入
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 数据源模式：'frontend' 使用前端 JS 模拟，'backend' 使用 Rust 后端
const dataSource = ref<'frontend' | 'backend'>('frontend');
let tauriUnlisten: UnlistenFn | null = null;

const mapContainer = ref<HTMLElement | null>(null);
const logContainer = ref<HTMLElement | null>(null);
const aircrafts = ref<Map<string, AircraftState>>(new Map());
const markers = ref<Map<string, L.Marker>>(new Map());
const logs = ref<string[]>([]);

// UI菜单状态
const activeMenu = ref<'planes' | 'map' | 'stats'>('planes');
const selectedPlaneId = ref<string | null>(null);
const searchQuery = ref<string>('');
const showSidebar = ref<boolean>(true);  // 控制侧边栏显示
const showLogs = ref<boolean>(true);     // 控制日志面板显示
const showReplayPanel = ref<boolean>(false); // 控制数据回放浮窗显示
const replayPanelPosition = ref({ x: 50, y: 50 }); // 浮窗位置
const isDraggingReplayPanel = ref<boolean>(false); // 是否正在拖动浮窗
const mouseDownPos = ref({ x: 0, y: 0 }); // 鼠标按下时的绝对坐标
const panelStartPos = ref({ x: 0, y: 0 }); // 浮窗开始拖动时的位置

let map: L.Map | null = null;
let heatmapLayer: any = null;
let aircraftLayer: L.LayerGroup | null = null;
let trajectoryLayer: L.LayerGroup | null = null;  // 轨迹线图层
let simulationInterval: number | null = null;

// ==================== 录制与回放状态 ====================
const recorder = new AdsbRecorder();
const replayEngine = new ReplayEngine();

// 模式: 'simulation' | 'recording' | 'replay'
const mode = ref<'simulation' | 'recording' | 'replay'>('simulation');
const playbackState = ref<PlaybackState>('idle');
const playbackSpeed = ref<number>(1.0);
const playbackProgress = ref<number>(0);
const playbackCurrentTime = ref<number>(0);
const playbackTotalTime = ref<number>(0);

// 文件上传 ref
const fileInputRef = ref<HTMLInputElement | null>(null);

// ==================== 轨迹数据存储 ====================
// 每架飞机的完整轨迹数据（按时间排序）
const trajectories = ref<Map<string, AircraftTrajectory>>(new Map());
// 当前显示的轨迹线 (Polyline 对象)
const trajectoryLines = ref<Map<string, L.Polyline>>(new Map());
// 是否正在拖动时间轴
const isDragging = ref<boolean>(false);
// 显示轨迹开关
const showTrajectory = ref<boolean>(true);

// Store accumulated heatmap points: {lat, lng, nic, timestamp}
const accumulatedPoints: Array<{lat: number, lng: number, nic: number, timestamp: number}> = [];

// Custom Heatmap Layer Class Definition
const createHeatmapLayer = () => {
  return (L as any).Layer.extend({
    initialize: function (options: any) {
      this._points = [];
      this.options = options || {};
    },

    setPoints: function (points: any[]) {
      this._points = points;
      this._redraw();
    },

    onAdd: function (map: any) {
      this._map = map;
      if (!this._canvas) {
        this._initCanvas();
      }
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on('moveend', this._reset, this);
      map.on('resize', this._resize, this);
      this._reset();
    },

    onRemove: function (map: any) {
      map.getPanes().overlayPane.removeChild(this._canvas);
      map.off('moveend', this._reset, this);
      map.off('resize', this._resize, this);
    },

    _initCanvas: function () {
      this._canvas = L.DomUtil.create('canvas', 'leaflet-custom-heatmap-layer');
      this._canvas.style.position = 'absolute';
      this._canvas.style.pointerEvents = 'none';
      
      const size = this._map.getSize();
      this._canvas.width = size.x;
      this._canvas.height = size.y;
    },
    
    _resize: function() {
        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._reset();
    },

    _reset: function () {
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._redraw();
    },

    _redraw: function () {
      if (!this._map || !this._canvas) return;
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

      // Use 'screen' or 'lighter' for glowing/blending effect like the reference image
      ctx.globalCompositeOperation = 'screen';

      const now = Date.now();
      const maxAge = 60000; // Match the cleanup logic

      this._points.forEach((p: any) => {
        const point = this._map.latLngToContainerPoint([p.lat, p.lng]);
        
        if (point.x < -100 || point.y < -100 || point.x > this._canvas.width + 100 || point.y > this._canvas.height + 100) return;

        // Calculate fading based on age
        const age = now - p.timestamp;
        if (age > maxAge) return;
        const life = Math.max(0, 1 - (age / maxAge));
        // Apply a curve to life so it doesn't fade too fast initially
        const alphaScale = life * life; 

        // Color Mapping: NIC 0 (Red) -> NIC 11 (Green)
        const hue = (p.nic / 11) * 120; 
        
        ctx.beginPath();
        
        // Larger radius for smoother blending
        const radius = 80; 
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        
        // Gaussian-like decay with low alpha for accumulation
        // This creates the "hotspot" effect when points overlap
        gradient.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.15 * alphaScale})`);
        gradient.addColorStop(0.3, `hsla(${hue}, 100%, 50%, ${0.08 * alphaScale})`);
        gradient.addColorStop(0.6, `hsla(${hue}, 100%, 50%, ${0.02 * alphaScale})`);
        gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
};

// Truth data (Hidden from display, used to generate signals)
const truthAircrafts = ref<Map<string, AircraftState>>(new Map());

// Simple plane icon SVG
const planeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
</svg>
`;

const createPlaneIcon = (heading: number, nic: number) => {
  // Color based on NIC (Signal Quality)
  // High NIC (8-11) = Green, Medium (4-7) = Yellow, Low (0-3) = Red
  let color = '#ff3333';
  if (nic >= 8) color = '#33ff33';
  else if (nic >= 4) color = '#ffaa33';

  return L.divIcon({
    html: `<div style="transform: rotate(${heading}deg); color: ${color}; filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.5));">${planeSvg}</div>`,
    className: 'plane-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const generateMockAircraft = () => {
  const count = 12;
  // 深圳坐标中心：22.5431°N, 114.0579°E
  const centerLat = 22.5431;
  const centerLng = 114.0579;

  // 真实的国内航空公司航班前缀和真实航班号
  const airlines = [
    { prefix: 'CZ', name: '中国南方航空' },      // China Southern
    { prefix: 'CA', name: '中国国际航空' },      // Air China
    { prefix: 'MU', name: '中国东方航空' },      // China Eastern
    { prefix: 'BZ', name: '中国海南航空' },      // Hainan Airlines
    { prefix: 'FM', name: '上海虹桥航空' },      // Shanghai Airlines
    { prefix: 'ZH', name: '深圳航空' },          // Shenzhen Airlines
  ];

  for (let i = 0; i < count; i++) {
    const icaoId = (0x780000 + i).toString(16).toUpperCase(); // Fake ICAO
    const airline = airlines[i % airlines.length];
    const flightNum = String(1000 + Math.floor(Math.random() * 8000)).substring(0, 4);
    const callsign = `${airline.prefix}${flightNum}`;

    truthAircrafts.value.set(icaoId, {
      id: icaoId,
      lat: centerLat + (Math.random() - 0.5) * 1.2,
      lng: centerLng + (Math.random() - 0.5) * 1.2,
      heading: Math.random() * 360,
      speed: 400 + Math.random() * 250,  // 更现实的巡航速度
      altitude: 5000 + Math.random() * 10000,  // 更低的高度范围（起降相关）
      nic: Math.floor(Math.random() * 12),
      callsign: callsign,
      lastSeen: Date.now()
    });
  }
};

const processSignal = () => {
  // 1. Update Truth Data (Move planes)
  truthAircrafts.value.forEach((aircraft) => {
    const distance = aircraft.speed / 3600 / 60; 
    const mathRad = (90 - aircraft.heading) * (Math.PI / 180);
    aircraft.lat += distance * Math.sin(mathRad);
    aircraft.lng += distance * Math.cos(mathRad);
    aircraft.heading += (Math.random() - 0.5) * 5;
    
    // Randomly fluctuate NIC to simulate changing signal environment
    if (Math.random() > 0.9) {
      aircraft.nic = Math.max(0, Math.min(11, aircraft.nic + (Math.random() > 0.5 ? 1 : -1)));
    }
  });

  // 2. Generate Signals (Simulator) & 3. Decode Signals (Receiver)
  truthAircrafts.value.forEach((aircraft) => {
    // Generate Position Message
    const hexPos = AdsbSimulator.generatePositionMessage(aircraft.id, aircraft.lat, aircraft.lng, aircraft.altitude, aircraft.nic);
    handleReceivedMessage(hexPos);

    // Generate Velocity Message (occasionally)
    if (Math.random() > 0.5) {
      const hexVel = AdsbSimulator.generateVelocityMessage(aircraft.id, aircraft.speed, aircraft.heading);
      handleReceivedMessage(hexVel);
    }
  });

  updateMap();
};

const handleReceivedMessage = (hex: string, eventTimestamp?: number) => {
  // 录制模式：记录消息
  if (mode.value === 'recording') {
    recorder.recordMessage(hex);
  }

  // Log raw message
  logs.value.unshift(`[RX] ${hex}`);
  if (logs.value.length > 50) logs.value.pop();

  // Decode
  const result = AdsbDecoder.decodeMessage(hex);
  if (result && result.data) {
    const { icao, data } = result;
    
    let state = aircrafts.value.get(icao);
    if (!state) {
      // 从真实飞机数据中获取航班号
      const truthAircraft = truthAircrafts.value.get(icao);
      const callsign = truthAircraft?.callsign || 'Unknown';
      
      state = {
        id: icao,
        lat: 0, lng: 0, heading: 0, speed: 0, altitude: 0, nic: 0, callsign: callsign, lastSeen: 0
      };
      aircrafts.value.set(icao, state);
    }

    state.lastSeen = Date.now();

    if (data.type === 'position') {
      const pos = data as DecodedPosition;
      state.lat = pos.lat;
      state.lng = pos.lng;
      state.altitude = pos.altitude;
      state.nic = pos.nic;
      
      // 回放模式：收集轨迹点
      if (mode.value === 'replay' && eventTimestamp !== undefined) {
        addTrajectoryPoint(icao, {
          lat: pos.lat,
          lng: pos.lng,
          altitude: pos.altitude,
          heading: state.heading,
          speed: state.speed,
          nic: pos.nic,
          timestamp: eventTimestamp
        });
      }
    } else if (data.type === 'velocity') {
      const vel = data as DecodedVelocity;
      state.speed = vel.speed;
      state.heading = vel.heading;
    }
  }
};

/**
 * 添加轨迹点到指定飞机
 */
const addTrajectoryPoint = (icao: string, point: TrajectoryPoint) => {
  let trajectory = trajectories.value.get(icao);
  if (!trajectory) {
    const state = aircrafts.value.get(icao);
    trajectory = {
      id: icao,
      callsign: state?.callsign || 'Unknown',
      points: []
    };
    trajectories.value.set(icao, trajectory);
  }
  
  // 避免重复添加相同时间戳的点
  const lastPoint = trajectory.points[trajectory.points.length - 1];
  if (!lastPoint || lastPoint.timestamp !== point.timestamp) {
    trajectory.points.push(point);
  }
};

/**
 * 获取指定时间之前的轨迹点
 */
const getTrajectoryUpToTime = (icao: string, targetTime: number): TrajectoryPoint[] => {
  const trajectory = trajectories.value.get(icao);
  if (!trajectory) return [];
  return trajectory.points.filter(p => p.timestamp <= targetTime);
};

/**
 * 更新轨迹显示
 */
const updateTrajectoryDisplay = (targetTime?: number) => {
  if (!trajectoryLayer || !showTrajectory.value) {
    // 隐藏所有轨迹线
    trajectoryLines.value.forEach((line) => {
      if (trajectoryLayer) trajectoryLayer.removeLayer(line as any);
    });
    trajectoryLines.value.clear();
    return;
  }

  const currentTime = targetTime ?? playbackCurrentTime.value;
  
  // 为每架飞机更新轨迹线
  trajectories.value.forEach((_trajectory, icao) => {
    const points = getTrajectoryUpToTime(icao, currentTime);
    
    if (points.length < 2) {
      // 点数不足，移除已有的线
      const existingLine = trajectoryLines.value.get(icao);
      if (existingLine) {
        trajectoryLayer!.removeLayer(existingLine as any);
        trajectoryLines.value.delete(icao);
      }
      return;
    }
    
    // 生成 LatLng 数组
    const latLngs = points.map(p => new L.LatLng(p.lat, p.lng));
    
    // 获取颜色（根据平均 NIC）
    const avgNic = points.reduce((sum, p) => sum + p.nic, 0) / points.length;
    const color = getTrajectoryColor(avgNic);
    
    let line = trajectoryLines.value.get(icao);
    if (line) {
      // 更新已有线
      line.setLatLngs(latLngs);
      line.setStyle({ color });
    } else {
      // 创建新线
      line = L.polyline(latLngs, {
        color,
        weight: 3,
        opacity: 0.8,
        smoothFactor: 1
      });
      line.addTo(trajectoryLayer!);
      trajectoryLines.value.set(icao, line);
    }
  });
};

/**
 * 根据 NIC 值获取轨迹颜色
 */
const getTrajectoryColor = (nic: number): string => {
  // NIC 0-3: 红色, 4-7: 黄色, 8-11: 绿色
  if (nic >= 8) return '#33ff33';
  if (nic >= 4) return '#ffaa33';
  return '#ff3333';
};

/**
 * 重建指定时间点的状态（从头处理所有消息）
 */
const rebuildStateToTime = (targetTime: number) => {
  // 清空当前飞机状态（但保留 truthAircrafts）
  aircrafts.value.clear();
  markers.value.forEach((marker) => {
    if (aircraftLayer) aircraftLayer.removeLayer(marker as any);
  });
  markers.value.clear();
  
  // 清空轨迹数据
  trajectories.value.clear();
  trajectoryLines.value.forEach((line) => {
    if (trajectoryLayer) trajectoryLayer.removeLayer(line as any);
  });
  trajectoryLines.value.clear();
  
  // ✅ 清空热力图数据（修复累积问题）
  accumulatedPoints.length = 0;
  if (heatmapLayer) {
    heatmapLayer.setPoints([]);
  }
  
  // 获取目标时间之前的所有事件
  const events = replayEngine.getEventsUpTo(targetTime);
  
  // 重新处理所有消息
  events.forEach(event => {
    handleReceivedMessage(event.hexMessage, event.timestamp);
  });
  
  // 更新地图和轨迹显示（传递目标时间用于热力图）
  updateMap(targetTime);
  updateTrajectoryDisplay(targetTime);
};

const updateMap = (replayTargetTime?: number) => {
  if (!map || !aircraftLayer) return;

  // 调试日志：记录飞机数量
  const validAircrafts = Array.from(aircrafts.value.values()).filter(a => a.lat !== 0 && a.lng !== 0);
  if (mode.value === 'replay' && validAircrafts.length > 0) {
    console.log(`[Debug] Updating map with ${validAircrafts.length} aircraft(s)`);
  }

  // Update Markers
  aircrafts.value.forEach((aircraft) => {
    if (aircraft.lat === 0 && aircraft.lng === 0) return; // Skip if no position yet

    let marker = markers.value.get(aircraft.id);
    const newLatLng = new L.LatLng(aircraft.lat, aircraft.lng);

    if (marker) {
      marker.setLatLng(newLatLng);
      marker.setIcon(createPlaneIcon(aircraft.heading, aircraft.nic));
      marker.setPopupContent(`
        <b>ICAO: ${aircraft.id}</b><br>
        NIC: ${aircraft.nic} (GNSS Quality)<br>
        Alt: ${aircraft.altitude.toFixed(0)} ft<br>
        Speed: ${aircraft.speed.toFixed(0)} kts
      `);
    } else {
      marker = L.marker(newLatLng, {
        icon: createPlaneIcon(aircraft.heading, aircraft.nic)
      });
      if (aircraftLayer) marker.addTo(aircraftLayer); // Add to aircraft layer
      marker.bindPopup(`<b>ICAO: ${aircraft.id}</b>`);
      markers.value.set(aircraft.id, marker);
    }
  });

  // Update Heatmap (GNSS Quality Distribution)
  if (heatmapLayer) {
    const activeAircraft = Array.from(aircrafts.value.values()).filter(a => a.lat !== 0);
    const now = Date.now();
    
    // ✅ 回放模式下，如果是重建状态（replayTargetTime 已提供），不添加新点
    // 这样可以避免拖动时间轴时重复添加热力图点
    if (replayTargetTime === undefined) {
      activeAircraft.forEach(a => {
        accumulatedPoints.push({ lat: a.lat, lng: a.lng, nic: a.nic, timestamp: now });
      });
    }
    
    // Remove points older than 60 seconds
    const maxAge = 60000;
    while (accumulatedPoints.length > 0 && (now - accumulatedPoints[0].timestamp > maxAge)) {
      accumulatedPoints.shift();
    }

    heatmapLayer.setPoints(accumulatedPoints);
  }
};

onMounted(async () => {
  // 初始化并更新日期时间
  updateDateTime();
  setInterval(updateDateTime, 1000);

  if (mapContainer.value) {
    // 深圳坐标：22.5431°N, 114.0579°E，缩放级别 11
    map = L.map(mapContainer.value).setView([22.5431, 114.0579], 11);

    // Layer 1: Base Map
    const baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Layer 2: Custom Heatmap (Linear Color)
    const HeatmapLayerClass = createHeatmapLayer();
    // @ts-ignore
    heatmapLayer = new HeatmapLayerClass();
    map.addLayer(heatmapLayer);

    // Layer 3: Trajectory Lines (轨迹线图层)
    trajectoryLayer = L.layerGroup().addTo(map);

    // Layer 4: Aircrafts (Top layer)
    aircraftLayer = L.layerGroup().addTo(map);

    // Layer Control
    const overlays = {
      "Aircraft": aircraftLayer,
      "Trajectory": trajectoryLayer,
      "GNSS Heatmap": heatmapLayer
    };
    
    L.control.layers({ "OpenStreetMap": baseLayer }, overlays).addTo(map);

    // 计算浮窗的正中间位置
    const mainContent = document.querySelector('.main-content') as HTMLElement;
    if (mainContent) {
      const rect = mainContent.getBoundingClientRect();
      const panelWidth = 500; // 浮窗标准宽度
      const panelHeight = 400; // 浮窗标准高度
      replayPanelPosition.value = {
        x: (rect.width - panelWidth) / 2,
        y: (rect.height - panelHeight) / 2
      };
    }

    // 尝试启动 Rust 后端模拟
    try {
      await startRustSimulation();
    } catch (e) {
      // 如果 Tauri 不可用（浏览器运行），使用前端模拟
      console.log('[Frontend] Tauri not available, using frontend simulation');
      dataSource.value = 'frontend';
      generateMockAircraft();
      simulationInterval = window.setInterval(processSignal, 1000);
    }

    // 添加鼠标事件监听（用于浮窗拖动）
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
});

// ==================== Tauri 后端通信 ====================

interface TauriAircraft {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  nic: number;
}

interface AdsbBatchEvent {
  messages: Array<{ hex_message: string; aircraft_id: string; message_type: string }>;
  aircrafts: TauriAircraft[];
  timestamp: number;
}

const startRustSimulation = async () => {
  // 监听 Rust 后端的 ADS-B 数据事件
  tauriUnlisten = await listen<AdsbBatchEvent>('adsb-batch', (event) => {
    handleRustAdsbBatch(event.payload);
  });

  // 启动 Rust 后端模拟
  await invoke('start_simulation', {
    config: {
      center_lat: 22.5431,
      center_lng: 114.0579,
      aircraft_count: 12,
      update_interval_ms: 1000,
    }
  });

  dataSource.value = 'backend';
  logs.value.unshift('[System] 🦀 Using Rust backend for ADS-B simulation');
};

const stopRustSimulation = async () => {
  try {
    await invoke('stop_simulation');
    if (tauriUnlisten) {
      tauriUnlisten();
      tauriUnlisten = null;
    }
    logs.value.unshift('[System] 🛑 Rust simulation stopped');
  } catch (e) {
    console.error('Failed to stop Rust simulation:', e);
  }
};

const handleRustAdsbBatch = (batch: AdsbBatchEvent) => {
  // 更新真实飞机数据（从 Rust 获取）
  batch.aircrafts.forEach((aircraft) => {
    truthAircrafts.value.set(aircraft.id, {
      id: aircraft.id,
      lat: aircraft.lat,
      lng: aircraft.lng,
      heading: aircraft.heading,
      speed: aircraft.speed,
      altitude: aircraft.altitude,
      nic: aircraft.nic,
      callsign: aircraft.callsign,
      lastSeen: Date.now()
    });
  });

  // 处理 ADS-B 消息
  batch.messages.forEach((msg) => {
    handleReceivedMessage(msg.hex_message);
  });

  updateMap();
};

onUnmounted(async () => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }
  
  // 停止 Rust 后端模拟（如果正在运行）
  if (dataSource.value === 'backend') {
    await stopRustSimulation();
  }
  
  replayEngine.stop();
  // 移除鼠标事件监听
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});

// ==================== 录制与回放控制函数 ====================

/**
 * 开始录制
 */
const startRecording = () => {
  if (!map) return;
  
  const center = map.getCenter();
  const zoom = map.getZoom();
  
  mode.value = 'recording';
  recorder.startRecording([center.lat, center.lng], zoom, truthAircrafts.value);
  
  logs.value.unshift('[System] 🔴 Recording started');
};

/**
 * 停止录制
 */
const stopRecording = () => {
  const session = recorder.stopRecording();
  if (session) {
    // 自动保存到 LocalStorage
    const key = `adsb-recording-${Date.now()}`;
    StorageManager.saveToLocalStorage(key, session);
    
    // 提示用户下载
    logs.value.unshift(`[System] ⏹️ Recording stopped (${session.events.length} events, ${(session.duration/1000).toFixed(1)}s)`);
  }
  
  mode.value = 'simulation';
};

/**
 * 下载当前录制
 */
const downloadRecording = () => {
  const session = recorder.stopRecording();
  if (session) {
    StorageManager.downloadAsFile(session);
    mode.value = 'simulation';
    logs.value.unshift('[System] 💾 Recording downloaded');
  }
};

/**
 * 加载录制文件
 */
const loadRecordingFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const session = await StorageManager.loadFromFile(file);
  if (session) {
    if (replayEngine.loadSession(session)) {
      mode.value = 'replay';
      
      // 停止模拟
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      
      // 清空当前状态
      clearCurrentState();
      
      // 设置地图中心
      if (map && session.mapConfig) {
        map.setView(session.mapConfig.center, session.mapConfig.zoom);
      }
      
      // 恢复初始状态
      const initEvent = session.events.find(e => e.type === 'init');
      if (initEvent?.data.truthStates) {
        initEvent.data.truthStates.forEach(state => {
          truthAircrafts.value.set(state.id, {
            ...state,
            lastSeen: Date.now()
          });
        });
      }
      
      logs.value.unshift(`[System] 📂 Loaded recording: ${session.events.length} events, ${(session.duration/1000).toFixed(1)}s`);
      
      // 设置回调
      setupReplayCallbacks();
      
      // 立即更新一次地图以显示初始状态（如果有）
      updateMap();
    }
  }
  
  // 重置文件输入
  input.value = '';
};

/**
 * 设置回放回调
 */
const setupReplayCallbacks = () => {
  replayEngine.onMessage((hexMessage, timestamp) => {
    handleReceivedMessage(hexMessage, timestamp);
  });

  // 批量更新回调：在每帧处理完所有消息后统一更新地图和轨迹（性能更优）
  replayEngine.onBatchUpdate(() => {
    updateMap();
    if (!isDragging.value) {
      updateTrajectoryDisplay();
    }
  });
  
  replayEngine.onProgress((progress, currentTime, totalTime) => {
    playbackProgress.value = progress;
    playbackCurrentTime.value = currentTime;
    playbackTotalTime.value = totalTime;
  });
  
  replayEngine.onStateChange((state) => {
    playbackState.value = state;
  });
  
  replayEngine.onFinish(() => {
    logs.value.unshift('[System] ✅ Playback finished');
  });
};

/**
 * 播放控制
 */
const playReplay = () => {
  replayEngine.play();
  // 立即更新一次地图以确保初始帧显示
  updateMap();
  logs.value.unshift('[System] ▶️ Playback started');
};

const pauseReplay = () => {
  replayEngine.pause();
  logs.value.unshift('[System] ⏸️ Playback paused');
};

const stopReplay = () => {
  replayEngine.stop();
  clearCurrentState();
  logs.value.unshift('[System] ⏹️ Playback stopped');
};

const _seekReplay = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const targetTime = parseFloat(input.value);
  replayEngine.seekTo(targetTime);
  
  // 拖动时重建状态并更新轨迹显示
  rebuildStateToTime(targetTime);
};

/**
 * 时间轴拖动开始
 */
const onSeekStart = () => {
  isDragging.value = true;
  // 拖动时暂停播放
  if (playbackState.value === 'playing') {
    replayEngine.pause();
  }
};

/**
 * 时间轴拖动结束
 */
const onSeekEnd = () => {
  isDragging.value = false;
};

/**
 * 时间轴实时拖动输入
 */
const onSeekInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const progressValue = parseFloat(input.value);
  
  // 根据进度百分比计算目标时间（毫秒）
  const targetTimeMs = (progressValue / 100) * playbackTotalTime.value;
  
  // 更新当前时间显示
  playbackCurrentTime.value = targetTimeMs;
  playbackProgress.value = progressValue;
  
  // 更新回放引擎位置（传入毫秒值）
  replayEngine.seekTo(targetTimeMs);
  
  // 实时重建状态并更新轨迹显示
  rebuildStateToTime(targetTimeMs);
};

/**
 * 切换轨迹显示
 */
const toggleTrajectory = () => {
  updateTrajectoryDisplay(playbackCurrentTime.value);
};

const changeSpeed = (newSpeed: number) => {
  playbackSpeed.value = newSpeed;
  replayEngine.setSpeed(newSpeed);
  logs.value.unshift(`[System] 🎚️ Speed: ${newSpeed}x`);
};

/**
 * 返回模拟模式
 */
const backToSimulation = () => {
  replayEngine.stop();
  clearCurrentState();
  mode.value = 'simulation';
  
  // 重启模拟
  generateMockAircraft();
  simulationInterval = window.setInterval(processSignal, 1000);
  
  logs.value.unshift('[System] 🔄 Back to simulation mode');
};

/**
 * 清空当前状态
 */
const clearCurrentState = () => {
  // 清空飞机列表
  aircrafts.value.clear();
  truthAircrafts.value.clear();
  
  // 清空标记
  markers.value.forEach((marker) => {
    if (aircraftLayer) aircraftLayer.removeLayer(marker as any);
  });
  markers.value.clear();
  
  // 清空轨迹数据
  trajectories.value.clear();
  trajectoryLines.value.forEach((line) => {
    if (trajectoryLayer) trajectoryLayer.removeLayer(line as any);
  });
  trajectoryLines.value.clear();
  
  // 清空热力图
  accumulatedPoints.length = 0;
  if (heatmapLayer) {
    heatmapLayer.setPoints([]);
  }
};

/**
 * 格式化时间显示
 */
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * 触发文件输入
 */
const triggerFileInput = () => {
  fileInputRef.value?.click();
};

// Computed properties
const isRecording = computed(() => mode.value === 'recording');
const isReplaying = computed(() => mode.value === 'replay');
const canRecord = computed(() => mode.value === 'simulation');
const canReplay = computed(() => mode.value !== 'recording');

// 日期时间显示
const currentTime = ref<string>('00:00:00');
const currentDate = ref<string>('0000-00-00');

const updateDateTime = () => {
  const now = new Date();
  currentTime.value = now.toLocaleTimeString('zh-CN', { hour12: false });
  currentDate.value = now.toLocaleDateString('zh-CN');
};

// 雷达点位置计算
const getRadarDotStyle = (plane: AircraftState, index: number) => {
  // 将飞机位置映射到雷达圆内
  const angle = (plane.heading + index * 45) * (Math.PI / 180);
  const distance = 25 + Math.random() * 20; // 随机分布在圆内
  return {
    left: `${50 + Math.cos(angle) * distance}%`,
    top: `${50 + Math.sin(angle) * distance}%`,
    animationDelay: `${index * 0.2}s`
  };
};

// 选择飞机
const selectPlane = (id: string) => {
  selectedPlaneId.value = id;
};

// 飞机列表计算属性（支持搜索过滤）
const planesList = computed(() => {
  const planes: AircraftState[] = [];
  aircrafts.value.forEach((aircraft) => {
    planes.push(aircraft);
  });
  
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    return planes.filter(p => 
      (p.callsign && p.callsign.toLowerCase().includes(query)) ||
      p.id.toLowerCase().includes(query)
    );
  }
  
  return planes.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
});

// 当前选中的飞机
const selectedPlane = computed(() => {
  if (!selectedPlaneId.value) return null;
  return aircrafts.value.get(selectedPlaneId.value) || null;
});

// 浮窗拖动相关函数
const onReplayPanelMouseDown = (event: MouseEvent) => {
  // 点击浮窗任意位置都可以拖动
  isDraggingReplayPanel.value = true;
  // 记录鼠标按下时的绝对坐标
  mouseDownPos.value = { x: event.clientX, y: event.clientY };
  // 记录浮窗当前的位置
  panelStartPos.value = { x: replayPanelPosition.value.x, y: replayPanelPosition.value.y };
};

const onMouseMove = (event: MouseEvent) => {
  if (isDraggingReplayPanel.value) {
    const panel = document.querySelector('.replay-panel') as HTMLElement;
    
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      
      // 计算鼠标移动的距离
      const deltaX = event.clientX - mouseDownPos.value.x;
      const deltaY = event.clientY - mouseDownPos.value.y;
      
      // 新位置 = 起始位置 + 移动距离
      const newX = panelStartPos.value.x + deltaX;
      const newY = panelStartPos.value.y + deltaY;
      
      // 限制浮窗在视口范围内
      const maxX = window.innerWidth - panelRect.width;
      const maxY = window.innerHeight - panelRect.height;
      
      replayPanelPosition.value = {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      };
    }
  }
};

const onMouseUp = () => {
  isDraggingReplayPanel.value = false;
};
</script>

<template>
  <div class="radar-layout">
    <!-- 顶部导航栏 -->
    <header class="top-header">
      <div class="header-left">
        <div class="system-logo">
          <span class="logo-icon">📡</span>
          <span class="logo-text">ADS-B 雷达监控系统</span>
        </div>
        <div class="system-status">
          <span class="status-dot online"></span>
          <span>系统在线</span>
        </div>
      </div>
      <nav class="header-nav">
        <button :class="['nav-btn', { active: activeMenu === 'map' }]" @click="activeMenu = 'map'">
          <span>📡</span> 态势显示
        </button>
        <button :class="['nav-btn', { active: activeMenu === 'planes' }]" @click="activeMenu = 'planes'">
          <span>✈️</span> 目标列表
        </button>
        <button :class="['nav-btn', { active: activeMenu === 'stats' }]" @click="activeMenu = 'stats'">
          <span>📊</span> 统计分析
        </button>
        <button class="nav-btn" @click="showReplayPanel = true">
          <span>🎬</span> 数据回放
        </button>
      </nav>
      <div class="header-right">
        <div class="datetime">
          <span class="date">{{ currentDate }}</span>
          <span class="time">{{ currentTime }}</span>
        </div>
        <div class="data-source-badge">
          <span class="badge" :class="dataSource">
            {{ dataSource === 'backend' ? '🦀 Rust后端' : '📺 前端模拟' }}
          </span>
        </div>
      </div>
    </header>

    <div class="main-body">
      <!-- 左侧面板 -->
      <aside class="left-panel" :class="{ collapsed: !showSidebar }">
        <button class="panel-toggle left" @click="showSidebar = !showSidebar" :title="showSidebar ? '隐藏状态栏' : '显示状态栏'">
          <span class="toggle-icon">{{ showSidebar ? '«' : '»' }}</span>
        </button>
        
        <div v-show="showSidebar" class="panel-content">
          <!-- 雷达状态信息 -->
          <div class="info-block">
            <div class="block-header">
              <span class="header-icon">📡</span>
              <span>雷达状态</span>
            </div>
            <div class="block-body">
              <div class="info-row">
                <span class="label">设备编号</span>
                <span class="value">ADS-B/SZ-001</span>
              </div>
              <div class="info-row">
                <span class="label">位置</span>
                <span class="value">22.54°N, 114.06°E</span>
              </div>
              <div class="info-row">
                <span class="label">探测范围</span>
                <span class="value">450km</span>
              </div>
              <div class="info-row">
                <span class="label">更新频率</span>
                <span class="value">1Hz</span>
              </div>
              <div class="info-row">
                <span class="label">数据源</span>
                <span class="value highlight">{{ dataSource === 'backend' ? 'Rust后端' : '前端模拟' }}</span>
              </div>
            </div>
          </div>

          <!-- 雷达扫描仪表盘 -->
          <div class="info-block">
            <div class="block-header">
              <span class="header-icon">🎯</span>
              <span>扫描状态</span>
            </div>
            <div class="radar-gauge">
              <div class="radar-circle">
                <div class="radar-sweep"></div>
                <div class="radar-center"></div>
                <div class="radar-rings">
                  <div class="ring"></div>
                  <div class="ring"></div>
                  <div class="ring"></div>
                </div>
                <div class="radar-targets">
                  <div v-for="(plane, index) in planesList.slice(0, 8)" :key="plane.id" 
                       class="target-dot" 
                       :style="getRadarDotStyle(plane, index)">
                  </div>
                </div>
              </div>
              <div class="gauge-info">
                <div class="gauge-item">
                  <span class="gauge-value">{{ aircrafts.size }}</span>
                  <span class="gauge-label">目标数量</span>
                </div>
                <div class="gauge-item">
                  <span class="gauge-value">{{ planesList.filter(p => p.nic >= 8).length }}</span>
                  <span class="gauge-label">高精度</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 选中飞机详细信息 -->
          <div v-if="selectedPlane" class="info-block aircraft-detail">
            <div class="block-header">
              <span class="header-icon">✈️</span>
              <span>目标详情</span>
              <button class="close-detail" @click="selectedPlaneId = null">×</button>
            </div>
            <div class="aircraft-visual">
              <div class="aircraft-icon-large">✈️</div>
              <div class="aircraft-callsign">{{ selectedPlane.callsign || selectedPlane.id }}</div>
            </div>
            <div class="aircraft-params">
              <div class="param-row">
                <div class="param">
                  <span class="param-label">ICAO</span>
                  <span class="param-value">{{ selectedPlane.id }}</span>
                </div>
                <div class="param">
                  <span class="param-label">航班号</span>
                  <span class="param-value">{{ selectedPlane.callsign }}</span>
                </div>
              </div>
              <div class="param-row">
                <div class="param">
                  <span class="param-label">高度</span>
                  <span class="param-value">{{ selectedPlane.altitude.toFixed(0) }}<small>m</small></span>
                </div>
                <div class="param">
                  <span class="param-label">速度</span>
                  <span class="param-value">{{ selectedPlane.speed.toFixed(0) }}<small>km/h</small></span>
                </div>
              </div>
              <div class="param-row">
                <div class="param">
                  <span class="param-label">航向</span>
                  <span class="param-value">{{ selectedPlane.heading.toFixed(0) }}<small>°</small></span>
                </div>
                <div class="param">
                  <span class="param-label">NIC</span>
                  <span class="param-value" :class="['nic', selectedPlane.nic >= 8 ? 'good' : selectedPlane.nic >= 4 ? 'medium' : 'poor']">
                    {{ selectedPlane.nic }}/11
                  </span>
                </div>
              </div>
              <div class="param-row full">
                <div class="param">
                  <span class="param-label">经纬度</span>
                  <span class="param-value small">{{ selectedPlane.lat.toFixed(4) }}°N, {{ selectedPlane.lng.toFixed(4) }}°E</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 目标列表 -->
          <div class="info-block target-list">
            <div class="block-header">
              <span class="header-icon">📋</span>
              <span>监测目标 ({{ aircrafts.size }})</span>
            </div>
            <div class="search-box">
              <input v-model="searchQuery" type="text" placeholder="🔍 搜索航班号/ID..." class="search-input" />
            </div>
            <div class="targets-scroll">
              <div v-for="(plane, index) in planesList" :key="plane.id" 
                   :class="['target-item', { selected: selectedPlaneId === plane.id }]"
                   @click="selectPlane(plane.id)">
                <span class="target-index">{{ (index + 1).toString().padStart(2, '0') }}</span>
                <div class="target-icon">✈️</div>
                <div class="target-info">
                  <div class="target-name">{{ plane.callsign || plane.id }}</div>
                  <div class="target-details">
                    {{ plane.altitude.toFixed(0) }}m · {{ plane.speed.toFixed(0) }}km/h · {{ plane.heading.toFixed(0) }}°
                  </div>
                </div>
                <div :class="['target-nic', plane.nic >= 8 ? 'good' : plane.nic >= 4 ? 'medium' : 'poor']">
                  {{ plane.nic }}
                </div>
              </div>
              <div v-if="planesList.length === 0" class="empty-state">暂无目标数据</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 中央地图区域 -->
      <main class="map-area">
        <div ref="mapContainer" class="map-container"></div>
        
        <!-- 地图覆盖层信息 -->
        <div class="map-overlay top-left">
          <div class="overlay-info">
            <span class="label">探测区域</span>
            <span class="value">深圳空域</span>
          </div>
        </div>

        <!-- 统计面板（覆盖在地图上） -->
        <div v-if="activeMenu === 'stats'" class="stats-overlay">
          <div class="stats-panel">
            <h3>📊 实时统计分析</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <div class="stat-icon">✈️</div>
                <div class="stat-value">{{ aircrafts.size }}</div>
                <div class="stat-label">在线目标</div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">📶</div>
                <div class="stat-value">{{ planesList.filter(p => p.nic >= 8).length }}</div>
                <div class="stat-label">高精度信号</div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">⚠️</div>
                <div class="stat-value">{{ planesList.filter(p => p.nic < 4).length }}</div>
                <div class="stat-label">低质量信号</div>
              </div>
              <div class="stat-item">
                <div class="stat-icon">📝</div>
                <div class="stat-value">{{ logs.length }}</div>
                <div class="stat-label">消息记录</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- 右侧日志面板 -->
      <aside class="right-panel" :class="{ collapsed: !showLogs }">
        <button class="panel-toggle right" @click="showLogs = !showLogs" :title="showLogs ? '隐藏日志' : '显示日志'">
          <span class="toggle-icon">{{ showLogs ? '»' : '«' }}</span>
        </button>
        
        <div v-show="showLogs" class="panel-content">
          <div class="info-block logs-block">
            <div class="block-header">
              <span class="header-icon">📝</span>
              <span>系统日志</span>
            </div>
            <div ref="logContainer" class="logs-scroll">
              <div v-for="(log, index) in logs" :key="index" class="log-item">
                {{ log }}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- 数据回放浮窗 -->
    <div v-if="showReplayPanel" class="replay-panel" :style="{ left: replayPanelPosition.x + 'px', top: replayPanelPosition.y + 'px' }">
      <div class="replay-panel-header" @mousedown="onReplayPanelMouseDown">
        <h3>🎬 数据回放控制</h3>
        <button class="close-btn" @click.stop="showReplayPanel = false">×</button>
      </div>
      <div class="replay-panel-body">
        <!-- 模式指示 -->
        <div class="mode-indicator">
          <span v-if="mode === 'simulation'" class="badge badge-simulation">🟢 模拟模式</span>
          <span v-else-if="mode === 'recording'" class="badge badge-recording">🔴 正在录制</span>
          <span v-else-if="mode === 'replay'" class="badge badge-replay">▶️ 回放模式</span>
        </div>

        <!-- 录制控制 -->
        <div v-if="!isReplaying" class="control-group">
          <h5>📹 录制</h5>
          <button v-if="!isRecording" @click="startRecording" :disabled="!canRecord" class="btn btn-start">
            🔴 开始录制
          </button>
          <div v-else class="recording-controls">
            <button @click="stopRecording" class="btn btn-stop">⏹️ 停止录制</button>
            <button @click="downloadRecording" class="btn btn-download">⬇️ 下载数据</button>
          </div>
        </div>

        <!-- 回放控制 -->
        <div v-if="mode === 'replay'" class="control-group">
          <h5>▶️ 回放</h5>
          <div class="button-row">
            <button v-if="playbackState !== 'playing'" @click="playReplay" class="btn btn-play">▶️ 播放</button>
            <button v-else @click="pauseReplay" class="btn btn-pause">⏸️ 暂停</button>
            <button @click="stopReplay" class="btn btn-back">⏹️ 停止</button>
          </div>

          <div class="speed-control">
            <label>播放速度：</label>
            <button
              v-for="speed in [0.5, 1.0, 2.0, 4.0]"
              :key="speed"
              :class="['btn-speed', { active: playbackSpeed === speed }]"
              @click="changeSpeed(speed)"
            >
              {{ speed }}x
            </button>
          </div>

          <div class="progress-control" @mousedown.stop>
            <div class="time-display">
              {{ formatTime(playbackCurrentTime) }} / {{ formatTime(playbackTotalTime) }}
            </div>
            <input
              type="range"
              class="progress-slider"
              v-model.number="playbackProgress"
              min="0"
              max="100"
              step="0.1"
              @mousedown="onSeekStart"
              @mouseup="onSeekEnd"
              @input="onSeekInput"
            />
          </div>

          <label class="trajectory-toggle">
            <input v-model="showTrajectory" type="checkbox" @change="toggleTrajectory" />
            <span>显示飞行轨迹</span>
          </label>
        </div>

        <!-- 文件操作 -->
        <div class="control-group">
          <h5>📁 文件</h5>
          <button v-if="canRecord" @click="downloadRecording" class="btn btn-download">⬇️ 下载录制</button>
          <button @click="triggerFileInput" class="btn btn-load">⬆️ 加载录制</button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            style="display: none"
            @change="loadRecordingFile"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.plane-icon {
  background: transparent;
  border: none;
}
</style>

<style scoped>
/* ==================== 深色科技风格主题变量 ==================== */
:root {
  --bg-primary: #0a0e17;
  --bg-secondary: #0d1321;
  --bg-tertiary: #131b2e;
  --bg-card: #1a2332;
  --border-color: #1e3a5f;
  --border-glow: #00d4ff;
  --text-primary: #e0e6ed;
  --text-secondary: #8892a0;
  --text-muted: #5a6270;
  --accent-cyan: #00d4ff;
  --accent-blue: #0080ff;
  --accent-green: #00ff88;
  --accent-orange: #ff9500;
  --accent-red: #ff4757;
  --glow-cyan: 0 0 20px rgba(0, 212, 255, 0.3);
  --glow-green: 0 0 15px rgba(0, 255, 136, 0.3);
}

/* ==================== 整体布局 ==================== */
.radar-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0a0e17 0%, #0d1321 50%, #131b2e 100%);
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #e0e6ed;
  overflow: hidden;
}

/* ==================== 顶部导航栏 ==================== */
.top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 60px;
  background: linear-gradient(180deg, rgba(13, 19, 33, 0.98) 0%, rgba(10, 14, 23, 0.95) 100%);
  border-bottom: 1px solid #1e3a5f;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.5), inset 0 -1px 0 rgba(0, 212, 255, 0.1);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.system-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 24px;
  filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.6));
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
  background: linear-gradient(90deg, #00d4ff, #0080ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 2px;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #8892a0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 10px rgba(0, 255, 136, 0.6);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

.header-nav {
  display: flex;
  gap: 8px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #8892a0;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.nav-btn:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.3);
  color: #e0e6ed;
}

.nav-btn.active {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 128, 255, 0.1) 100%);
  border-color: #00d4ff;
  color: #00d4ff;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.2), inset 0 0 15px rgba(0, 212, 255, 0.05);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.datetime {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: 'Consolas', 'Courier New', monospace;
}

.datetime .date {
  font-size: 11px;
  color: #5a6270;
}

.datetime .time {
  font-size: 18px;
  font-weight: 600;
  color: #00d4ff;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

.data-source-badge .badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

.data-source-badge .badge.backend {
  background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  color: white;
  box-shadow: 0 0 15px rgba(247, 147, 30, 0.4);
}

.data-source-badge .badge.frontend {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

/* ==================== 主体区域 ==================== */
.main-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ==================== 左侧面板 ==================== */
.left-panel {
  position: relative;
  width: 320px;
  background: linear-gradient(180deg, rgba(13, 19, 33, 0.95) 0%, rgba(10, 14, 23, 0.98) 100%);
  border-right: 1px solid #1e3a5f;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, margin-left 0.3s ease;
  overflow: visible;
  z-index: 1000;
}

.left-panel.collapsed {
  width: 0;
  margin-left: -1px;
}

.panel-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 80px;
  background: linear-gradient(180deg, rgba(0, 60, 100, 0.95) 0%, rgba(0, 40, 80, 0.98) 100%);
  border: 2px solid #00d4ff;
  color: #00d4ff;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.5), inset 0 0 10px rgba(0, 212, 255, 0.1);
}

.panel-toggle .toggle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.8);
}

.panel-toggle.left {
  right: -24px;
  border-radius: 0 8px 8px 0;
  border-left: none;
}

.panel-toggle.right {
  left: -24px;
  border-radius: 8px 0 0 8px;
  border-right: none;
}

.panel-toggle:hover {
  background: linear-gradient(180deg, rgba(0, 100, 150, 0.95) 0%, rgba(0, 60, 100, 0.98) 100%);
  color: #fff;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.6);
  transform: translateY(-50%) scale(1.05);
}

.panel-toggle:active {
  transform: translateY(-50%) scale(0.95);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: inherit;
}

/* 自定义滚动条 */
.panel-content::-webkit-scrollbar,
.targets-scroll::-webkit-scrollbar,
.logs-scroll::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track,
.targets-scroll::-webkit-scrollbar-track,
.logs-scroll::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb,
.targets-scroll::-webkit-scrollbar-thumb,
.logs-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #00d4ff 0%, #0080ff 100%);
  border-radius: 3px;
}

/* ==================== 信息块样式 ==================== */
.info-block {
  background: linear-gradient(135deg, rgba(26, 35, 50, 0.8) 0%, rgba(13, 19, 33, 0.9) 100%);
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.block-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.1) 0%, transparent 100%);
  border-bottom: 1px solid #1e3a5f;
  font-size: 13px;
  font-weight: 600;
  color: #00d4ff;
}

.header-icon {
  font-size: 16px;
}

.block-body {
  padding: 12px 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(30, 58, 95, 0.5);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  font-size: 12px;
  color: #5a6270;
}

.info-row .value {
  font-size: 13px;
  color: #e0e6ed;
  font-family: 'Consolas', monospace;
}

.info-row .value.highlight {
  color: #00ff88;
  text-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
}

/* ==================== 雷达仪表盘 ==================== */
.radar-gauge {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.radar-circle {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 212, 255, 0.1) 0%, transparent 70%);
  border: 2px solid #1e3a5f;
  overflow: hidden;
}

.radar-sweep {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 2px;
  background: linear-gradient(90deg, #00d4ff, transparent);
  transform-origin: left center;
  animation: radar-sweep 3s linear infinite;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.8);
}

@keyframes radar-sweep {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.radar-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: #00d4ff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
}

.radar-rings .ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.radar-rings .ring:nth-child(1) { width: 40px; height: 40px; }
.radar-rings .ring:nth-child(2) { width: 70px; height: 70px; }
.radar-rings .ring:nth-child(3) { width: 100px; height: 100px; }

.target-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  background: #00ff88;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.8);
  animation: blink 1.5s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.gauge-info {
  display: flex;
  gap: 24px;
}

.gauge-item {
  text-align: center;
}

.gauge-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #00d4ff;
  text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

.gauge-label {
  font-size: 11px;
  color: #5a6270;
}

/* ==================== 浮窗面板（深色科技风） ==================== */
.replay-panel {
  position: fixed;
  background: linear-gradient(135deg, rgba(13, 19, 33, 0.98) 0%, rgba(10, 14, 23, 0.98) 100%);
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 212, 255, 0.1);
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1500;
  user-select: none;
}

.replay-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #1e3a5f;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 128, 255, 0.1) 100%);
  cursor: move;
}

.replay-panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #00d4ff;
  flex: 1;
}

.replay-panel-header .close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: #5a6270;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.replay-panel-header .close-btn:hover {
  color: #ff4757;
}

.replay-panel-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  background: rgba(10, 14, 23, 0.5);
}

.replay-panel.dragging {
  cursor: grabbing !important;
}

.replay-panel-header.dragging {
  cursor: grabbing !important;
}

/* ==================== 目标列表样式 ==================== */
.target-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid #1e3a5f;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  color: #e0e6ed;
  font-size: 13px;
  transition: all 0.3s;
}

.search-input::placeholder {
  color: #5a6270;
}

.search-input:focus {
  outline: none;
  border-color: #00d4ff;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.2);
}

.targets-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  max-height: 300px;
}

.target-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.target-item:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.3);
}

.target-item.selected {
  background: rgba(0, 212, 255, 0.15);
  border-color: #00d4ff;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.2);
}

.target-index {
  font-size: 11px;
  color: #5a6270;
  font-family: 'Consolas', monospace;
  min-width: 20px;
}

.target-icon {
  font-size: 16px;
}

.target-info {
  flex: 1;
  min-width: 0;
}

.target-name {
  font-size: 13px;
  font-weight: 600;
  color: #e0e6ed;
  margin-bottom: 2px;
}

.target-details {
  font-size: 11px;
  color: #5a6270;
  font-family: 'Consolas', monospace;
}

.target-nic {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.target-nic.good {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
}

.target-nic.medium {
  background: rgba(255, 149, 0, 0.2);
  color: #ff9500;
}

.target-nic.poor {
  background: rgba(255, 71, 87, 0.2);
  color: #ff4757;
}

.empty-state {
  text-align: center;
  color: #5a6270;
  padding: 40px 20px;
  font-size: 13px;
}

/* ==================== 飞机详情面板 ==================== */
.aircraft-detail .close-detail {
  margin-left: auto;
  background: none;
  border: none;
  color: #5a6270;
  font-size: 18px;
  cursor: pointer;
  transition: color 0.2s;
}

.aircraft-detail .close-detail:hover {
  color: #ff4757;
}

.aircraft-visual {
  text-align: center;
  padding: 16px;
  border-bottom: 1px solid #1e3a5f;
}

.aircraft-icon-large {
  font-size: 48px;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.5));
}

.aircraft-callsign {
  font-size: 18px;
  font-weight: 700;
  color: #00d4ff;
  letter-spacing: 2px;
}

.aircraft-params {
  padding: 12px 16px;
}

.param-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.param-row.full .param {
  flex: 1;
}

.param {
  flex: 1;
  background: rgba(0, 0, 0, 0.2);
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid #1e3a5f;
}

.param-label {
  display: block;
  font-size: 10px;
  color: #5a6270;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.param-value {
  font-size: 15px;
  font-weight: 600;
  color: #e0e6ed;
  font-family: 'Consolas', monospace;
}

.param-value small {
  font-size: 11px;
  color: #5a6270;
  margin-left: 2px;
}

.param-value.small {
  font-size: 12px;
}

.param-value.nic.good { color: #00ff88; }
.param-value.nic.medium { color: #ff9500; }
.param-value.nic.poor { color: #ff4757; }

/* ==================== 地图区域 ==================== */
.map-area {
  flex: 1;
  position: relative;
  background: #0a0e17;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-overlay {
  position: absolute;
  z-index: 500;
  padding: 8px 12px;
  background: rgba(10, 14, 23, 0.85);
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  backdrop-filter: blur(10px);
}

.map-overlay.top-left {
  top: 16px;
  left: 16px;
}

.map-overlay.top-right {
  top: 16px;
  right: 16px;
}

.overlay-info .label {
  font-size: 10px;
  color: #5a6270;
  text-transform: uppercase;
}

.overlay-info .value {
  font-size: 13px;
  color: #00d4ff;
  font-weight: 600;
}

/* ==================== 统计面板覆盖层 ==================== */
.stats-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 600;
}

.stats-panel {
  background: rgba(10, 14, 23, 0.95);
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1);
}

.stats-panel h3 {
  margin: 0 0 20px 0;
  color: #00d4ff;
  font-size: 18px;
  text-align: center;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-item {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition: all 0.3s;
}

.stat-item:hover {
  border-color: #00d4ff;
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
}

.stat-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #00d4ff;
  text-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #5a6270;
}

/* ==================== 右侧日志面板 ==================== */
.right-panel {
  position: relative;
  width: 300px;
  background: linear-gradient(180deg, rgba(13, 19, 33, 0.95) 0%, rgba(10, 14, 23, 0.98) 100%);
  border-left: 1px solid #1e3a5f;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, margin-right 0.3s ease;
  z-index: 1000;
}

.right-panel.collapsed {
  width: 0;
  margin-right: -1px;
}

.logs-block {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.logs-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.3);
  max-height: calc(100vh - 200px);
}

.log-item {
  padding: 4px 0;
  color: #00ff88;
  border-bottom: 1px solid rgba(30, 58, 95, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==================== 控制组和状态指示（深色风格） ==================== */
.mode-indicator {
  margin-bottom: 16px;
}

.badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.badge-simulation {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
  border: 1px solid rgba(0, 255, 136, 0.3);
}

.badge-recording {
  background: rgba(255, 71, 87, 0.2);
  color: #ff4757;
  border: 1px solid rgba(255, 71, 87, 0.3);
  animation: pulse-recording 1.5s infinite;
}

.badge-replay {
  background: rgba(0, 212, 255, 0.2);
  color: #00d4ff;
  border: 1px solid rgba(0, 212, 255, 0.3);
}

@keyframes pulse-recording {
  0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(255, 71, 87, 0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 20px rgba(255, 71, 87, 0.8); }
}

.control-group {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #1e3a5f;
}

.control-group h5 {
  font-size: 12px;
  font-weight: 600;
  color: #5a6270;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 12px 0;
}

.btn {
  padding: 10px 16px;
  margin: 4px 4px 4px 0;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-start {
  background: linear-gradient(135deg, #ff4757 0%, #ff6b6b 100%);
  color: white;
  width: 100%;
  box-shadow: 0 4px 15px rgba(255, 71, 87, 0.3);
}

.btn-start:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 71, 87, 0.5);
}

.btn-stop {
  background: linear-gradient(135deg, #ff9500 0%, #ffb347 100%);
  color: white;
}

.btn-download {
  background: linear-gradient(135deg, #00ff88 0%, #00d68f 100%);
  color: #0a0e17;
}

.btn-load {
  background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%);
  color: white;
  width: 100%;
}

.btn-play {
  background: linear-gradient(135deg, #00ff88 0%, #00d68f 100%);
  color: #0a0e17;
}

.btn-pause {
  background: linear-gradient(135deg, #ff9500 0%, #ffb347 100%);
  color: white;
}

.btn-back {
  background: rgba(90, 98, 112, 0.5);
  color: #e0e6ed;
  border: 1px solid #5a6270;
}

.recording-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.button-row {
  display: flex;
  gap: 8px;
}

.button-row .btn {
  flex: 1;
  margin: 0;
}

.speed-control {
  display: flex;
  align-items: center;
  margin-top: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.speed-control label {
  font-size: 12px;
  color: #5a6270;
}

.btn-speed {
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.3);
  color: #8892a0;
  border: 1px solid #1e3a5f;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-speed:hover {
  background: rgba(0, 212, 255, 0.1);
  border-color: rgba(0, 212, 255, 0.3);
}

.btn-speed.active {
  background: linear-gradient(135deg, #00d4ff 0%, #0080ff 100%);
  border-color: #00d4ff;
  color: white;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.4);
}

.progress-control {
  margin-top: 12px;
}

.time-display {
  font-size: 13px;
  color: #00d4ff;
  margin-bottom: 8px;
  text-align: center;
  font-family: 'Consolas', monospace;
}

.progress-slider {
  width: 100%;
  height: 6px;
  cursor: pointer;
  -webkit-appearance: none;
  background: #1e3a5f;
  border-radius: 3px;
  outline: none;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #00d4ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

.trajectory-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #8892a0;
  cursor: pointer;
  user-select: none;
}

.trajectory-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #00d4ff;
}

.trajectory-toggle:hover span {
  color: #e0e6ed;
}

/* ==================== 响应式设计 ==================== */
@media (max-width: 1200px) {
  .left-panel {
    width: 280px;
  }
  
  .right-panel {
    width: 260px;
  }
}

@media (max-width: 900px) {
  .radar-layout {
    flex-direction: column;
  }
  
  .top-header {
    flex-wrap: wrap;
    height: auto;
    padding: 12px;
  }
  
  .header-nav {
    order: 3;
    width: 100%;
    justify-content: center;
    margin-top: 10px;
  }
  
  .main-body {
    flex-direction: column;
  }
  
  .left-panel {
    width: 100%;
    max-height: 40vh;
    border-right: none;
    border-bottom: 1px solid #1e3a5f;
  }
  
  .right-panel {
    width: 100%;
    max-height: 30vh;
    border-left: none;
    border-top: 1px solid #1e3a5f;
  }
  
  .panel-toggle.left {
    display: none;
  }
  
  .panel-toggle.right {
    display: none;
  }
  
  .stats-panel {
    min-width: auto;
    width: 90%;
    max-width: 400px;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>