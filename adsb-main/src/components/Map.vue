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
  const count = 10;
  const centerLat = 39.9042;
  const centerLng = 116.4074;

  for (let i = 0; i < count; i++) {
    const id = (0x780000 + i).toString(16).toUpperCase(); // Fake ICAO
    truthAircrafts.value.set(id, {
      id,
      lat: centerLat + (Math.random() - 0.5) * 0.8,
      lng: centerLng + (Math.random() - 0.5) * 0.8,
      heading: Math.random() * 360,
      speed: 200 + Math.random() * 300,
      altitude: 10000 + Math.random() * 20000,
      nic: Math.floor(Math.random() * 12), // Random GNSS Quality 0-11
      callsign: `CA${1000 + i}`,
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
      state = {
        id: icao,
        lat: 0, lng: 0, heading: 0, speed: 0, altitude: 0, nic: 0, callsign: 'Unknown', lastSeen: 0
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
    map = L.map(mapContainer.value).setView([39.9042, 116.4074], 9);

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
    
    // Simulation Loop (1Hz)
    simulationInterval = window.setInterval(processSignal, 1000);
  }
});

onUnmounted(() => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }
  replayEngine.stop();
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

// Computed properties
const isRecording = computed(() => mode.value === 'recording');
const isReplaying = computed(() => mode.value === 'replay');
const canRecord = computed(() => mode.value === 'simulation');
const canReplay = computed(() => mode.value !== 'recording');
</script>

<template>
  <div class="container">
    <div ref="mapContainer" class="map-container"></div>
    
    <!-- 控制面板 -->
    <div class="control-panel">
      <h3>🎬 数据回放控制</h3>
      
      <!-- 模式指示 -->
      <div class="mode-indicator">
        <span v-if="mode === 'simulation'" class="badge badge-simulation">🟢 模拟模式</span>
        <span v-else-if="mode === 'recording'" class="badge badge-recording">🔴 正在录制</span>
        <span v-else-if="mode === 'replay'" class="badge badge-replay">▶️ 回放模式</span>
      </div>

      <!-- 录制控制 -->
      <div v-if="!isReplaying" class="control-group">
        <h4>📹 录制</h4>
        <button v-if="!isRecording" @click="startRecording" :disabled="!canRecord" class="btn btn-start">
          🔴 开始录制
        </button>
        <div v-else class="recording-controls">
          <button @click="stopRecording" class="btn btn-stop">⏹️ 停止录制</button>
          <button @click="downloadRecording" class="btn btn-download">💾 停止并下载</button>
        </div>
      </div>

      <!-- 回放控制 -->
      <div class="control-group">
        <h4>▶️ 回放</h4>
        
        <!-- 文件加载 -->
        <div v-if="!isReplaying" class="file-upload">
          <input 
            ref="fileInputRef" 
            type="file" 
            accept=".json" 
            @change="loadRecordingFile" 
            style="display: none"
          />
          <button @click="fileInputRef?.click()" :disabled="!canReplay" class="btn btn-load">
            📂 加载录制文件
          </button>
        </div>

        <!-- 回放控制按钮 -->
        <div v-else class="replay-controls">
          <div class="button-row">
            <button 
              v-if="playbackState !== 'playing'" 
              @click="playReplay" 
              class="btn btn-play"
            >
              ▶️ 播放
            </button>
            <button 
              v-else 
              @click="pauseReplay" 
              class="btn btn-pause"
            >
              ⏸️ 暂停
            </button>
            <button @click="stopReplay" class="btn btn-stop">⏹️ 停止</button>
            <button @click="backToSimulation" class="btn btn-back">🔄 返回模拟</button>
          </div>

          <!-- 播放速度控制 -->
          <div class="speed-control">
            <label>速度:</label>
            <button 
              v-for="speed in [0.5, 1, 2, 4]" 
              :key="speed"
              @click="changeSpeed(speed)"
              :class="['btn-speed', { active: playbackSpeed === speed }]"
            >
              {{ speed }}x
            </button>
          </div>

          <!-- 进度条 -->
          <div class="progress-control">
            <div class="time-display">
              {{ formatTime(playbackCurrentTime) }} / {{ formatTime(playbackTotalTime) }}
            </div>
            <input 
              type="range" 
              :min="0" 
              :max="playbackTotalTime" 
              :value="playbackCurrentTime"
              @input="onSeekInput"
              @mousedown="onSeekStart"
              @mouseup="onSeekEnd"
              @touchstart="onSeekStart"
              @touchend="onSeekEnd"
              class="progress-slider"
            />
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: (playbackProgress * 100) + '%' }"></div>
            </div>
            
            <!-- 轨迹显示控制 -->
            <label class="trajectory-toggle">
              <input type="checkbox" v-model="showTrajectory" @change="toggleTrajectory" />
              <span>📍 显示飞行轨迹</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 日志面板 -->
    <div class="log-panel">
      <h3>ADS-B Receiver Log (1090MHz)</h3>
      <div class="logs" ref="logContainer">
        <div v-for="(log, index) in logs" :key="index" class="log-entry">{{ log }}</div>
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
.container {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.map-container {
  flex: 1;
  height: 100%;
}

/* ==================== 控制面板 ==================== */
.control-panel {
  width: 320px;
  background: #2d2d2d;
  color: #e0e0e0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #444;
  padding: 15px;
  overflow-y: auto;
}

.control-panel h3 {
  margin: 0 0 15px 0;
  font-size: 18px;
  color: #fff;
  border-bottom: 2px solid #4CAF50;
  padding-bottom: 8px;
}

.control-panel h4 {
  margin: 15px 0 10px 0;
  font-size: 14px;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.mode-indicator {
  margin-bottom: 15px;
}

.badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: bold;
}

.badge-simulation {
  background: #4CAF50;
  color: white;
}

.badge-recording {
  background: #f44336;
  color: white;
  animation: pulse 1.5s infinite;
}

.badge-replay {
  background: #2196F3;
  color: white;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.control-group {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #444;
}

/* ==================== 按钮样式 ==================== */
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
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
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
  background: #FF9800;
  color: white;
}

.btn-download {
  background: #4CAF50;
  color: white;
}

.btn-load {
  background: #2196F3;
  color: white;
  width: 100%;
}

.btn-play {
  background: #4CAF50;
  color: white;
}

.btn-pause {
  background: #FF9800;
  color: white;
}

.btn-back {
  background: #9E9E9E;
  color: white;
}

.recording-controls, .replay-controls {
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

/* ==================== 速度控制 ==================== */
.speed-control {
  display: flex;
  align-items: center;
  margin-top: 15px;
  gap: 8px;
}

.speed-control label {
  font-size: 13px;
  color: #aaa;
  margin-right: 5px;
}

.btn-speed {
  padding: 6px 12px;
  background: #444;
  color: #e0e0e0;
  border: 2px solid #555;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-speed:hover {
  background: #555;
}

.btn-speed.active {
  background: #2196F3;
  border-color: #2196F3;
  color: white;
  font-weight: bold;
}

/* ==================== 进度控制 ==================== */
.progress-control {
  margin-top: 15px;
}

.time-display {
  font-size: 13px;
  color: #aaa;
  margin-bottom: 8px;
  text-align: center;
  font-family: 'Courier New', monospace;
}

.progress-slider {
  width: 100%;
  margin-bottom: 10px;
  cursor: pointer;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: #444;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #2196F3);
  transition: width 0.1s linear;
}

/* ==================== 轨迹显示开关 ==================== */
.trajectory-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  color: #ccc;
  cursor: pointer;
  user-select: none;
}

.trajectory-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #2196F3;
}

.trajectory-toggle span {
  transition: color 0.2s;
}

.trajectory-toggle:hover span {
  color: #fff;
}

/* ==================== 日志面板 ==================== */
.log-panel {
  width: 300px;
  background: #1e1e1e;
  color: #00ff00;
  font-family: 'Courier New', Courier, monospace;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #333;
}

.log-panel h3 {
  padding: 10px;
  margin: 0;
  background: #333;
  font-size: 14px;
  color: #fff;
}

.logs {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  font-size: 12px;
}

.log-entry {
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Darken the map to make the glowing heatmap pop */
.leaflet-tile-pane {
  filter: brightness(0.6) invert(1) contrast(1.2) hue-rotate(180deg);
}
</style>
