<script setup lang="ts">
import { onMounted, ref, onUnmounted, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { AdsbSimulator, AdsbDecoder, type DecodedPosition, type DecodedVelocity } from '../utils/adsb';
import { AdsbRecorder, ReplayEngine, StorageManager, type PlaybackState } from '../utils/recorder';
import type { AircraftState, TrajectoryPoint, AircraftTrajectory } from '../utils/types';

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

onMounted(() => {
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

    generateMockAircraft();
    
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
    
    // Simulation Loop (1Hz)
    simulationInterval = window.setInterval(processSignal, 1000);

    // 添加鼠标事件监听（用于浮窗拖动）
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
});

onUnmounted(() => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
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
  const targetTime = parseFloat(input.value);
  
  // 更新回放引擎位置
  replayEngine.seekTo(targetTime);
  
  // 实时重建状态并更新轨迹显示
  rebuildStateToTime(targetTime);
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
  <div class="adsb-layout">
    <!-- 侧边栏隐藏/显示按钮 -->
    <button class="toggle-sidebar-btn" @click="showSidebar = !showSidebar" :title="showSidebar ? '隐藏菜单' : '显示菜单'">
      {{ showSidebar ? '◀' : '▶' }}
    </button>

    <!-- 侧边栏菜单 -->
    <aside v-show="showSidebar" class="sidebar">
      <div class="logo-section">
        <div class="logo">✈️ ADS-B</div>
        <div class="version">v1.0</div>
      </div>

      <nav class="main-menu">
        <button
          :class="['menu-item', { active: activeMenu === 'planes' }]"
          @click="activeMenu = 'planes'"
        >
          <span class="menu-icon">📡</span>
          <span>飞机列表</span>
        </button>
        <button
          :class="['menu-item', { active: activeMenu === 'map' }]"
          @click="activeMenu = 'map'"
        >
          <span class="menu-icon">🗺️</span>
          <span>地图视图</span>
        </button>
        <button
          :class="['menu-item', { active: activeMenu === 'stats' }]"
          @click="activeMenu = 'stats'"
        >
          <span class="menu-icon">📊</span>
          <span>统计分析</span>
        </button>
        <button
          class="menu-item"
          @click="showReplayPanel = true"
        >
          <span class="menu-icon">▶️</span>
          <span>数据回放</span>
        </button>
      </nav>

      <!-- 飞机列表视图 -->
      <div v-if="activeMenu === 'planes'" class="menu-content planes-list">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索航班号/ID..."
            class="search-input"
          />
        </div>
        <div class="planes-container">
          <div
            v-for="plane in planesList"
            :key="plane.id"
            :class="['plane-item', { selected: selectedPlaneId === plane.id }]"
            @click="selectedPlaneId = plane.id; activeMenu = 'map'"
          >
            <div class="plane-header">
              <span class="callsign">{{ plane.callsign || plane.id }}</span>
              <span :class="['status-badge', plane.nic >= 8 ? 'good' : plane.nic >= 4 ? 'medium' : 'poor']">
                NIC: {{ plane.nic }}
              </span>
            </div>
            <div class="plane-brief">
              <div>🌍 {{ plane.lat.toFixed(2) }}, {{ plane.lng.toFixed(2) }}</div>
              <div>📏 {{ plane.altitude.toFixed(0) }}m</div>
              <div>💨 {{ plane.speed.toFixed(0) }} km/h</div>
            </div>
          </div>
          <div v-if="planesList.length === 0" class="empty-state">
            暂无飞机数据
          </div>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 地图视图 -->
      <section v-show="activeMenu === 'map' || activeMenu === 'planes'" class="map-section">
        <div ref="mapContainer" class="map-container"></div>

        <!-- 飞机信息卡片 -->
        <transition name="slide-up">
          <div v-if="selectedPlane" class="plane-info-card">
            <div class="card-header">
              <span class="flight-number">{{ selectedPlane.callsign || selectedPlane.id }}</span>
              <button class="close-btn" @click="selectedPlaneId = null">×</button>
            </div>
            <div class="card-body">
              <div class="info-grid">
                <div class="info-item">
                  <label>ICAO ID</label>
                  <span>{{ selectedPlane.id }}</span>
                </div>
                <div class="info-item">
                  <label>航班号</label>
                  <span>{{ selectedPlane.callsign }}</span>
                </div>
                <div class="info-item">
                  <label>经度</label>
                  <span>{{ selectedPlane.lng.toFixed(6) }}</span>
                </div>
                <div class="info-item">
                  <label>纬度</label>
                  <span>{{ selectedPlane.lat.toFixed(6) }}</span>
                </div>
                <div class="info-item">
                  <label>高度</label>
                  <span>{{ selectedPlane.altitude.toFixed(0) }} m</span>
                </div>
                <div class="info-item">
                  <label>速度</label>
                  <span>{{ selectedPlane.speed.toFixed(0) }} km/h</span>
                </div>
                <div class="info-item">
                  <label>航向</label>
                  <span>{{ selectedPlane.heading.toFixed(0) }}°</span>
                </div>
                <div class="info-item">
                  <label>信号质量</label>
                  <span :class="['nic-value', selectedPlane.nic >= 8 ? 'good' : selectedPlane.nic >= 4 ? 'medium' : 'poor']">
                    {{ selectedPlane.nic }}/11
                  </span>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </section>

      <!-- 统计分析视图 -->
      <section v-show="activeMenu === 'stats'" class="stats-section">
        <div class="section-header">📊 统计分析</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ aircrafts.size }}</div>
            <div class="stat-label">在线飞机</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ planesList.filter(p => p.nic >= 8).length }}</div>
            <div class="stat-label">高质量信号</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ logs.length }}</div>
            <div class="stat-label">事件日志</div>
          </div>
        </div>
      </section>

      <!-- 系统设置视图 -->
      <section v-show="activeMenu === 'stats'" class="stats-section">
        <div class="section-header">📊 统计分析</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ aircrafts.size }}</div>
            <div class="stat-label">在线飞机</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ planesList.filter(p => p.nic >= 8).length }}</div>
            <div class="stat-label">高质量信号</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ logs.length }}</div>
            <div class="stat-label">事件日志</div>
          </div>
        </div>
      </section>
    </main>

    <!-- 数据回放模态窗口 -->
    <!-- 数据回放浮窗 -->
    <div v-if="showReplayPanel" class="replay-panel" :style="{ left: replayPanelPosition.x + 'px', top: replayPanelPosition.y + 'px' }" @mousedown="onReplayPanelMouseDown">
      <div class="replay-panel-header">
        <h3>🎬 数据回放控制</h3>
        <button class="close-btn" @click="showReplayPanel = false">✕</button>
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

          <div class="progress-control">
            <div class="time-display">
              {{ formatTime(playbackCurrentTime) }} / {{ formatTime(playbackTotalTime) }}
            </div>
            <input
              type="range"
              class="progress-slider"
              :value="playbackProgress"
              min="0"
              max="100"
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

    <!-- 日志面板隐藏/显示按钮 -->
    <button class="toggle-logs-btn" @click="showLogs = !showLogs" :title="showLogs ? '隐藏日志' : '显示日志'">
      {{ showLogs ? '▶' : '◀' }}
    </button>

    <!-- 日志面板 -->
    <aside v-show="showLogs" class="log-panel">
      <h3>📝 日志</h3>
      <div ref="logContainer" class="logs">
        <div v-for="(log, index) in logs" :key="index" class="log-entry">
          {{ log }}
        </div>
      </div>
    </aside>
  </div>
</template>

<style>
.plane-icon {
  background: transparent;
  border: none;
}
</style>

<style scoped>
/* ==================== 模态窗口 ==================== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #e8eef5;
  background: #f6f8fa;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #232f3e;
}

.modal-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
  transition: color 0.2s;
}

.modal-close-btn:hover {
  color: #232f3e;
}

.modal-body {
  padding: 24px 28px;
  overflow-y: auto;
  flex: 1;
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

/* ==================== 浮窗面板 ==================== */
.replay-panel {
  position: fixed;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.25);
  width: 90%;
  max-width: 500px;
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
  padding: 20px 24px;
  border-bottom: 1px solid #e8eef5;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  cursor: move;
  transition: background 0.3s;
}

.replay-panel-header:hover {
  background: linear-gradient(135deg, #5568d3 0%, #673a8e 100%);
}

.replay-panel-header h3 {
  margin: 0;
  font-size: 18px;
  flex: 1;
}

.replay-panel-header .close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #fff;
  cursor: pointer;
  transition: opacity 0.2s;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.replay-panel-header .close-btn:hover {
  opacity: 0.8;
}

.replay-panel-body {
  padding: 24px 28px;
  overflow-y: auto;
  flex: 1;
}

.replay-panel.dragging {
  cursor: grabbing !important;
}

.replay-panel-header.dragging {
  cursor: grabbing !important;
}

/* ==================== 整体布局 ==================== */
.adsb-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #f6f8fa;
  font-family: 'Segoe UI', 'PingFang SC', Arial, sans-serif;
  position: relative;
}

/* ==================== 隐藏/显示按钮 ==================== */
.toggle-sidebar-btn {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  background: #409eff;
  border: none;
  color: white;
  font-size: 14px;
  cursor: pointer;
  z-index: 999;
  transition: all 0.3s;
  border-radius: 0 6px 6px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.toggle-sidebar-btn:hover {
  background: #66b1ff;
  width: 28px;
}

.toggle-logs-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  background: #409eff;
  border: none;
  color: white;
  font-size: 14px;
  cursor: pointer;
  z-index: 999;
  transition: all 0.3s;
  border-radius: 6px 0 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.toggle-logs-btn:hover {
  background: #66b1ff;
  width: 28px;
}

/* ==================== 侧边栏 ==================== */
.sidebar {
  width: 320px;
  background: #1e2139;
  color: #fff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #2a3148;
  overflow: hidden;
  transition: margin-left 0.3s ease, opacity 0.3s ease;
}

.logo-section {
  padding: 24px 20px;
  border-bottom: 1px solid #2a3148;
  text-align: center;
}

.logo {
  font-size: 1.8rem;
  font-weight: bold;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.version {
  font-size: 12px;
  color: #888;
}

.main-menu {
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  border-bottom: 1px solid #2a3148;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.menu-item.active {
  background: rgba(65, 157, 255, 0.15);
  color: #409eff;
  border-left: 4px solid #409eff;
  padding-left: 16px;
}

.menu-icon {
  font-size: 18px;
}

/* ==================== 菜单内容区 ==================== */
.menu-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* ==================== 飞机列表 ==================== */
.planes-list {
  display: flex;
  flex-direction: column;
}

.search-box {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  padding: 10px 12px;
  background: #2a3148;
  border: 1px solid #3a4560;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  transition: all 0.2s;
}

.search-input::placeholder {
  color: #666;
}

.search-input:focus {
  outline: none;
  border-color: #409eff;
  background: #323d54;
}

.planes-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plane-item {
  padding: 12px;
  background: #2a3148;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.plane-item:hover {
  background: #323d54;
  border-color: #409eff;
}

.plane-item.selected {
  background: rgba(65, 157, 255, 0.2);
  border-color: #409eff;
}

.plane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.callsign {
  font-weight: 600;
  color: #fff;
  font-size: 14px;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.good {
  background: rgba(76, 175, 80, 0.3);
  color: #4caf50;
}

.status-badge.medium {
  background: rgba(255, 152, 0, 0.3);
  color: #ff9800;
}

.status-badge.poor {
  background: rgba(244, 67, 54, 0.3);
  color: #f44336;
}

.plane-brief {
  font-size: 12px;
  color: #a0aec0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 40px 20px;
  font-size: 14px;
}

/* ==================== 主内容区 ==================== */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
  overflow: hidden;
}

.map-section {
  flex: 1;
  position: relative;
}

.map-container {
  width: 100%;
  height: 100%;
}

/* ==================== 飞机信息卡片 ==================== */
.plane-info-card {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 360px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(40px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(40px);
  opacity: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f6f8fa;
  border-bottom: 1px solid #e8eef5;
}

.flight-number {
  font-size: 16px;
  font-weight: 600;
  color: #232f3e;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #232f3e;
}

.card-body {
  padding: 16px 20px;
  max-height: 400px;
  overflow-y: auto;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-item label {
  font-size: 12px;
  color: #888;
  font-weight: 500;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-item span {
  font-size: 13px;
  color: #232f3e;
  font-weight: 500;
  font-family: 'Courier New', monospace;
}

.nic-value {
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
}

.nic-value.good {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
}

.nic-value.medium {
  background: rgba(255, 152, 0, 0.1);
  color: #ff9800;
}

.nic-value.poor {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

/* ==================== 统计分析视图 ==================== */
.stats-section {
  flex: 1;
  padding: 32px;
  overflow-y: auto;
}

.section-header {
  font-size: 24px;
  font-weight: 600;
  color: #232f3e;
  margin-bottom: 24px;
  border-bottom: 2px solid #409eff;
  padding-bottom: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.stat-card {
  padding: 24px;
  background: #f6f8fa;
  border-radius: 12px;
  text-align: center;
  border: 1px solid #e8eef5;
}

.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: #409eff;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

/* ==================== 控制组和状态指示 ==================== */
.mode-indicator {
  margin-bottom: 16px;
}

.badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: bold;
}

.badge-simulation {
  background: #4caf50;
  color: white;
}

.badge-recording {
  background: #f44336;
  color: white;
  animation: pulse 1.5s infinite;
}

.badge-replay {
  background: #2196f3;
  color: white;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.modal-body h5 {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 0;
  margin-bottom: 10px;
}

.control-group {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e8eef5;
}

.btn {
  padding: 10px 16px;
  margin: 5px 5px 5px 0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-start {
  background: #f44336;
  color: white;
  width: 100%;
}

.btn-stop {
  background: #ff9800;
  color: white;
}

.btn-download {
  background: #4caf50;
  color: white;
}

.btn-load {
  background: #2196f3;
  color: white;
  width: 100%;
}

.btn-play {
  background: #4caf50;
  color: white;
}

.btn-pause {
  background: #ff9800;
  color: white;
}

.btn-back {
  background: #9e9e9e;
  color: white;
}

.recording-controls,
.replay-controls {
  display: flex;
  flex-direction: column;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.button-row .btn {
  flex: 1;
  min-width: 100px;
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
  font-size: 13px;
  color: #666;
}

.btn-speed {
  padding: 6px 12px;
  background: #f6f8fa;
  color: #666;
  border: 1px solid #e8eef5;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-speed:hover {
  background: #e8eef5;
}

.btn-speed.active {
  background: #409eff;
  border-color: #409eff;
  color: white;
  font-weight: bold;
}

.progress-control {
  margin-top: 12px;
}

.time-display {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  text-align: center;
  font-family: 'Courier New', monospace;
}

.progress-slider {
  width: 100%;
  margin-bottom: 10px;
  cursor: pointer;
  height: 6px;
}

.trajectory-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  user-select: none;
}

.trajectory-toggle input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #409eff;
}

.trajectory-toggle span {
  transition: color 0.2s;
}

.trajectory-toggle:hover span {
  color: #232f3e;
}

/* ==================== 日志面板 ==================== */
.log-panel {
  width: 280px;
  background: #1e1e1e;
  color: #00ff00;
  font-family: 'Courier New', Courier, monospace;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #333;
  transition: margin-right 0.3s ease, opacity 0.3s ease;
}

.log-panel h3 {
  padding: 12px 16px;
  margin: 0;
  background: #2d2d2d;
  font-size: 14px;
  color: #fff;
  border-bottom: 1px solid #333;
}

.logs {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-size: 12px;
}

.log-entry {
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ==================== 响应式设计 ==================== */
@media (max-width: 1200px) {
  .sidebar {
    width: 280px;
  }

  .plane-info-card {
    width: 300px;
  }
}

@media (max-width: 900px) {
  .adsb-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid #2a3148;
  }

  .main-menu {
    flex-direction: row;
    overflow-x: auto;
  }

  .menu-item {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .main-content {
    flex: 1;
  }

  .log-panel {
    width: 100%;
    max-height: 150px;
    border-left: none;
    border-top: 1px solid #333;
  }

  .plane-info-card {
    width: 95%;
    right: 10px;
    left: 10px;
  }
}
</style>
