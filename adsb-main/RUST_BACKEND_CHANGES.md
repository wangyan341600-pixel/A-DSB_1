# ADS-B Rust 后端改造说明

## 概述

本次改造将 ADS-B 信号生成逻辑从前端 TypeScript 移至 Rust 后端，通过 Tauri 的 Commands 和 Events 机制实现前后端通信。

## 架构设计

```
┌─────────────────────────────────────────────────────┐
│                   前端 (Vue.js)                      │
│  - 监听 adsb-batch Event                            │
│  - 显示地图和飞机                                    │
│  - 调用 start_simulation / stop_simulation          │
└─────────────────────┬───────────────────────────────┘
                      │ Tauri Events / Commands
┌─────────────────────▼───────────────────────────────┐
│                   后端 (Rust)                        │
│  - AdsbSimulator 生成飞机数据                        │
│  - 每秒更新位置并推送 adsb-batch Event              │
│  - 生成 ADS-B hex 消息                              │
└─────────────────────────────────────────────────────┘
```

## 修改的文件

### 1. 新增文件：`src-tauri/src/adsb.rs`

ADS-B 模拟器 Rust 模块，包含：

```rust
/// 飞机数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aircraft {
    pub id: String,           // ICAO 地址
    pub callsign: String,     // 航班号
    pub lat: f64,             // 纬度
    pub lng: f64,             // 经度
    pub altitude: f64,        // 高度 (ft)
    pub speed: f64,           // 速度 (kts)
    pub heading: f64,         // 航向 (度)
    pub nic: u8,              // GNSS 质量 (0-11)
}

/// ADS-B 消息事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdsbEvent {
    pub hex_message: String,
    pub aircraft_id: String,
    pub message_type: String, // "position" or "velocity"
}

/// ADS-B 信号模拟器
pub struct AdsbSimulator {
    aircrafts: Vec<Aircraft>,
    center_lat: f64,
    center_lng: f64,
}
```

**主要方法：**

| 方法 | 功能 |
|------|------|
| `new(center_lat, center_lng)` | 创建模拟器实例 |
| `generate_mock_aircrafts(count)` | 生成模拟飞机（使用真实航空公司前缀） |
| `update_positions()` | 更新所有飞机的位置、高度、航向 |
| `generate_position_message(aircraft)` | 生成 DF17 Type 11 位置消息 |
| `generate_velocity_message(aircraft)` | 生成 DF17 Type 19 速度消息 |
| `generate_all_messages()` | 生成所有飞机的 ADS-B 消息列表 |

---

### 2. 修改文件：`src-tauri/src/lib.rs`

替换原有的简单 greet 函数，添加完整的模拟器状态管理和 Tauri Commands/Events：

```rust
mod adsb;

use adsb::{AdsbEvent, AdsbSimulator, Aircraft};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// 模拟器状态
struct SimulatorState {
    simulator: Arc<Mutex<AdsbSimulator>>,
    is_running: Arc<Mutex<bool>>,
}

/// 模拟配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationConfig {
    pub center_lat: f64,
    pub center_lng: f64,
    pub aircraft_count: usize,
    pub update_interval_ms: u64,
}
```

**Tauri Commands：**

| Command | 功能 |
|---------|------|
| `start_simulation` | 启动后端模拟，开始定时推送数据 |
| `stop_simulation` | 停止后端模拟 |
| `get_aircrafts` | 获取当前所有飞机数据 |
| `get_simulation_status` | 检查模拟是否正在运行 |

**Tauri Events：**

| Event | 数据结构 | 频率 |
|-------|----------|------|
| `adsb-batch` | `{ messages: AdsbEvent[], aircrafts: Aircraft[], timestamp: u64 }` | 1Hz (可配置) |

---

### 3. 修改文件：`src/components/Map.vue`

**新增导入：**

```typescript
// Tauri API 导入
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 数据源模式：'frontend' 使用前端 JS 模拟，'backend' 使用 Rust 后端
const dataSource = ref<'frontend' | 'backend'>('frontend');
let tauriUnlisten: UnlistenFn | null = null;
```

**新增接口定义：**

```typescript
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
```

**新增函数：**

```typescript
// 启动 Rust 后端模拟
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

// 停止 Rust 后端模拟
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

// 处理 Rust 推送的批量数据
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
```

**修改 `onMounted`：**

```typescript
onMounted(async () => {
  // ... 地图初始化代码 ...

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

  // ...
});
```

**修改 `onUnmounted`：**

```typescript
onUnmounted(async () => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }
  
  // 停止 Rust 后端模拟（如果正在运行）
  if (dataSource.value === 'backend') {
    await stopRustSimulation();
  }
  
  replayEngine.stop();
  // ...
});
```

---

## 运行方式

### 使用 Rust 后端（推荐）

```bash
cd adsb-main
npm run tauri dev
```

应用启动后，日志会显示：
```
[System] 🦀 Using Rust backend for ADS-B simulation
```

### 仅使用前端（浏览器开发）

```bash
cd adsb-main
npm run dev
```

浏览器中运行时会自动降级到前端 JS 模拟：
```
[Frontend] Tauri not available, using frontend simulation
```

---

## 数据流

1. **Rust 后端** 每秒执行一次 `update_positions()` 更新飞机位置
2. **Rust 后端** 调用 `generate_all_messages()` 生成 ADS-B hex 消息
3. **Rust 后端** 通过 `app.emit("adsb-batch", &event)` 推送数据到前端
4. **前端** 监听 `adsb-batch` 事件，更新 `truthAircrafts` 和处理消息
5. **前端** 调用 `updateMap()` 刷新地图显示

---

## 配置参数

通过 `SimulationConfig` 可配置：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `center_lat` | 22.5431 | 中心纬度（深圳） |
| `center_lng` | 114.0579 | 中心经度（深圳） |
| `aircraft_count` | 12 | 模拟飞机数量 |
| `update_interval_ms` | 1000 | 更新间隔（毫秒） |

---

## 航空公司前缀

Rust 后端使用以下真实航空公司前缀生成航班号：

| 前缀 | 航空公司 |
|------|----------|
| CZ | 中国南方航空 |
| CA | 中国国际航空 |
| MU | 中国东方航空 |
| BZ | 中国海南航空 |
| FM | 上海虹桥航空 |
| ZH | 深圳航空 |
| HU | 海南航空 |
| SC | 山东航空 |
| 3U | 四川航空 |
| GS | 天津航空 |
