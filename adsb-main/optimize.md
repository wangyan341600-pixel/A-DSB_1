# ADS-B 雷达监控系统 UI/UX 优化记录

**记录时间**：2025年12月19日 15:30

---

## 一、模式指示器优化

### 1.1 修改文件
- `src/components/Map.vue`

### 1.2 修改内容

#### 在顶部导航栏添加模式指示器（模板部分）
在 `header-right` 区域添加了新的模式指示器组件：

```vue
<!-- 模式指示器（顶部导航栏） -->
<div class="header-mode-indicator">
  <div v-if="mode === 'simulation'" class="mode-badge mode-simulation">
    <span class="mode-icon">📡</span>
    <span class="mode-text">模拟模式</span>
  </div>
  <div v-else-if="mode === 'recording'" class="mode-badge mode-recording">
    <span class="mode-icon recording-pulse">🔴</span>
    <span class="mode-text">正在录制</span>
    <span class="recording-timer">REC</span>
  </div>
  <div v-else-if="mode === 'replay'" class="mode-badge mode-replay">
    <span class="mode-icon">▶️</span>
    <span class="mode-text">回放模式</span>
    <span class="replay-progress">{{ formatTime(playbackCurrentTime) }}</span>
  </div>
</div>
```

#### 新增样式（CSS 部分）
```css
/* ==================== 顶部导航栏模式指示器 ==================== */
.header-mode-indicator {
  display: flex;
  align-items: center;
}

.mode-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.mode-icon {
  font-size: 14px;
}

.mode-text {
  letter-spacing: 0.5px;
}

/* 模拟模式 - 蓝色科技风 */
.mode-simulation {
  background: linear-gradient(135deg, rgba(0, 128, 255, 0.2) 0%, rgba(102, 126, 234, 0.15) 100%);
  border: 1px solid rgba(0, 128, 255, 0.4);
  color: #66b3ff;
  box-shadow: 0 0 15px rgba(0, 128, 255, 0.2), inset 0 0 10px rgba(0, 128, 255, 0.05);
}

.mode-simulation .mode-icon {
  animation: radar-rotate 3s linear infinite;
}

@keyframes radar-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 录制模式 - 红色警示风 */
.mode-recording {
  background: linear-gradient(135deg, rgba(255, 71, 87, 0.25) 0%, rgba(255, 107, 107, 0.2) 100%);
  border: 1px solid rgba(255, 71, 87, 0.5);
  color: #ff6b6b;
  box-shadow: 0 0 20px rgba(255, 71, 87, 0.3), inset 0 0 15px rgba(255, 71, 87, 0.1);
  animation: recording-glow 1.5s ease-in-out infinite;
}

.recording-pulse {
  animation: pulse-icon 1s ease-in-out infinite;
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
}

.recording-timer {
  background: rgba(255, 71, 87, 0.3);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  animation: blink-text 1s step-end infinite;
}

@keyframes blink-text {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes recording-glow {
  0%, 100% { 
    box-shadow: 0 0 20px rgba(255, 71, 87, 0.3), inset 0 0 15px rgba(255, 71, 87, 0.1);
  }
  50% { 
    box-shadow: 0 0 30px rgba(255, 71, 87, 0.5), inset 0 0 20px rgba(255, 71, 87, 0.15);
  }
}

/* 回放模式 - 绿色播放风 */
.mode-replay {
  background: linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 212, 255, 0.15) 100%);
  border: 1px solid rgba(0, 255, 136, 0.4);
  color: #00ff88;
  box-shadow: 0 0 15px rgba(0, 255, 136, 0.2), inset 0 0 10px rgba(0, 255, 136, 0.05);
}

.mode-replay .mode-icon {
  animation: play-bounce 0.8s ease-in-out infinite;
}

@keyframes play-bounce {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(2px); }
}

.replay-progress {
  background: rgba(0, 255, 136, 0.2);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-weight: 600;
}
```

### 1.3 效果
- **模拟模式**：蓝色背景 + 📡 雷达图标旋转动画
- **录制模式**：红色背景 + 🔴 脉冲动画 + "REC" 闪烁标签 + 边框呼吸发光
- **回放模式**：绿色背景 + ▶️ 弹跳动画 + 实时播放时间显示

---

## 二、关闭回放面板返回模拟模式

### 2.1 修改文件
- `src/components/Map.vue`

### 2.2 修改内容

#### 新增 `closeReplayPanel` 函数
```typescript
/**
 * 关闭回放面板
 * 关闭时立即返回模拟模式
 */
const closeReplayPanel = () => {
  showReplayPanel.value = false;
  
  // 如果不在模拟模式，立即返回模拟模式
  if (mode.value !== 'simulation') {
    backToSimulation();
  }
};
```

#### 修改模板中关闭按钮的事件绑定
```vue
<!-- 修改前 -->
<button class="close-btn" @click.stop="showReplayPanel = false">×</button>

<!-- 修改后 -->
<button class="close-btn" @click.stop="closeReplayPanel">×</button>
```

### 2.3 效果
关闭"数据回放控制"浮窗时，无论当前处于什么模式，都会立即返回模拟模式。

---

## 三、停止回放保留当前界面状态

### 3.1 修改文件
- `src/components/Map.vue`
- `src/utils/recorder.ts`

### 3.2 修改内容

#### 修改 `recorder.ts` 中的 `stop()` 方法
```typescript
/**
 * 停止播放
 * @param preserveState 是否保留当前状态（不重置播放位置）
 */
stop(preserveState: boolean = false) {
  // 取消动画帧
  if (this.animationFrameId !== null) {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  if (preserveState) {
    // 保留当前状态，只暂停播放
    // 记录当前播放位置到 pausedAt（便于后续恢复）
    if (this.state === 'playing') {
      this.pausedAt = (Date.now() - this.playbackStartTime) * this.playbackSpeed;
    }
    this.state = 'idle';
    this.onStateChangeCallback?.('idle');
    console.log('[Replay] ⏹️ Playback stopped (state preserved)');
  } else {
    // 完全重置
    this.state = 'idle';
    this.reset();
    this.onStateChangeCallback?.('idle');
    console.log('[Replay] ⏹️ Playback stopped and reset');
  }
}
```

#### 修改 `Map.vue` 中的 `stopReplay()` 函数
```typescript
const stopReplay = () => {
  // 停止回放引擎，但保留当前界面状态（传入 true 表示保留状态）
  replayEngine.stop(true);
  // 重置播放状态为 idle，但保持在 replay 模式
  playbackState.value = 'idle';
  logs.value.unshift('[System] ⏹️ Playback stopped (state preserved)');
};
```

### 3.3 效果
- 点击"停止"按钮时，飞机位置和轨迹保持不变
- 界面保持在当前时间点的状态
- 可以继续点击"播放"从当前位置恢复播放

---

## 四、回放模式只显示录制文件中的飞机

### 4.1 修改文件
- `src/components/Map.vue`

### 4.2 修改内容

#### 修改 `loadRecordingFile()` 函数
```typescript
const loadRecordingFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const session = await StorageManager.loadFromFile(file);
  if (session) {
    if (replayEngine.loadSession(session)) {
      // 先停止模拟（必须在切换模式之前）
      if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
      }
      
      // 停止 Rust 后端模拟（如果正在运行）
      if (dataSource.value === 'backend') {
        await stopRustSimulation();
        dataSource.value = 'frontend';
      }
      
      // 切换到回放模式
      mode.value = 'replay';
      
      // 清空当前所有状态（包括模拟模式的飞机）
      clearCurrentState();
      
      // 设置地图中心
      if (map && session.mapConfig) {
        map.setView(session.mapConfig.center, session.mapConfig.zoom);
      }
      
      // 注意：不恢复 truthAircrafts，回放模式只依赖录制的消息来重建飞机状态
      // truthAircrafts 只在模拟模式中使用，用于生成模拟信号
      
      logs.value.unshift(`[System] 📂 Loaded recording: ${session.events.length} events, ${(session.duration/1000).toFixed(1)}s`);
      
      // 设置回调
      setupReplayCallbacks();
      
      // 初始状态下地图为空，等待用户点击播放
      updateMap();
    }
  }
  
  // 重置文件输入
  input.value = '';
};
```

### 4.3 主要改动
1. 移除了恢复 `truthAircrafts` 的代码
2. 确保停止所有模拟源（前端定时器 + Rust 后端）
3. 清空所有现有状态后再进入回放模式

### 4.4 效果
- 加载录制文件后，地图清空
- 回放时只显示录制文件中的飞机数据
- 不会与模拟模式的飞机混淆

---

## 五、停止后点击播放继续播放（而非从头开始）

### 5.1 修改文件
- `src/utils/recorder.ts`

### 5.2 修改内容

#### 修改 `play()` 方法
```typescript
/**
 * 开始/继续播放
 */
play() {
  if (!this.session) {
    console.warn('[Replay] ⚠️ No session loaded');
    return;
  }

  if (this.state === 'finished') {
    this.reset();
  }

  if (this.state === 'paused' || (this.state === 'idle' && this.pausedAt > 0)) {
    // 从暂停/停止位置继续（pausedAt 保存了上次的播放位置）
    const pausedDuration = this.pausedAt / this.playbackSpeed;
    this.playbackStartTime = Date.now() - pausedDuration;
    console.log(`[Replay] ▶️ Resuming from ${(this.pausedAt / 1000).toFixed(1)}s`);
  } else {
    // 从头开始
    this.playbackStartTime = Date.now();
    console.log(`[Replay] ▶️ Starting from beginning`);
  }

  this.state = 'playing';
  this.onStateChangeCallback?.('playing');
  this.scheduleNextEvent();
}
```

### 5.3 主要改动
修改判断条件，增加对 `idle` 状态但 `pausedAt > 0` 的情况处理：
```typescript
// 修改前
if (this.state === 'paused')

// 修改后
if (this.state === 'paused' || (this.state === 'idle' && this.pausedAt > 0))
```

### 5.4 效果
- 点击"停止"后，`pausedAt` 保存当前播放位置
- 再次点击"播放"时，从保存的位置继续播放
- 只有在完全重置（返回模拟模式或重新加载文件）后才会从头开始

---

## 修改总结

| 序号 | 优化项 | 涉及文件 | 状态 |
|------|--------|----------|------|
| 1 | 顶部导航栏模式指示器 | Map.vue | ✅ 完成 |
| 2 | 关闭浮窗返回模拟模式 | Map.vue | ✅ 完成 |
| 3 | 停止回放保留状态 | Map.vue, recorder.ts | ✅ 完成 |
| 4 | 回放只显示录制飞机 | Map.vue | ✅ 完成 |
| 5 | 停止后继续播放 | recorder.ts | ✅ 完成 |

---

## 六、回放模式数据源显示优化

**记录时间**：2025年12月19日 16:15

### 6.1 修改文件
- `src/components/Map.vue`

### 6.2 问题描述
1. 加载录制文件并播放时，右上角数据源徽章显示"录制回放"，但左侧"雷达状态"栏的数据源仍显示"前端模拟"
2. 关闭"数据回放控制"浮窗后，数据源状态始终变为"前端模拟"，没有恢复到之前的数据源（可能是 Rust 后端）

### 6.3 修改内容

#### 1. 右上角数据源徽章支持回放模式
- 新增回放模式判断，当 `mode === 'replay'` 时显示"📼 录制回放"
- 新增 `.badge.replay` 样式（青绿色渐变背景）

#### 2. 左侧雷达状态数据源显示支持回放模式
- 修改显示逻辑，回放模式下显示"录制回放"

#### 3. 新增 `previousDataSource` 变量
- 用于保存进入回放模式前的数据源状态（`frontend` 或 `backend`）

#### 4. 修改 `loadRecordingFile()` 函数
- 在加载录制文件时，保存当前数据源到 `previousDataSource`

#### 5. 修改 `backToSimulation()` 函数
- 改为异步函数
- 根据 `previousDataSource` 恢复到正确的数据源：
  - 如果之前是 `backend`，重新启动 Rust 后端模拟
  - 如果之前是 `frontend`，重新启动前端模拟
- 添加错误处理：如果 Rust 后端启动失败，回退到前端模拟

#### 6. 修改 `closeReplayPanel()` 函数
- 改为异步函数，以支持异步的 `backToSimulation()`

### 6.4 效果

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| 回放模式 - 右上角徽章 | 显示"前端模拟" | 显示"📼 录制回放" |
| 回放模式 - 左侧雷达状态 | 显示"前端模拟" | 显示"录制回放" |
| Rust后端 → 回放 → 关闭浮窗 | 变为"前端模拟" | 恢复"Rust后端" |
| 前端模拟 → 回放 → 关闭浮窗 | 保持"前端模拟" | 保持"前端模拟" |

---

## 完整修改总结

| 序号 | 优化项 | 涉及文件 | 状态 |
|------|--------|----------|------|
| 1 | 顶部导航栏模式指示器 | Map.vue | ✅ 完成 |
| 2 | 关闭浮窗返回模拟模式 | Map.vue | ✅ 完成 |
| 3 | 停止回放保留状态 | Map.vue, recorder.ts | ✅ 完成 |
| 4 | 回放只显示录制飞机 | Map.vue | ✅ 完成 |
| 5 | 停止后继续播放 | recorder.ts | ✅ 完成 |
| 6 | 回放模式数据源显示优化 | Map.vue | ✅ 完成 |

---

## 七、态势显示与目标列表功能差异化

**记录时间**：2025年12月19日 16:45

### 7.1 修改文件
- `src/components/Map.vue`

### 7.2 问题描述
导航栏上的"态势显示"和"目标列表"两个功能按钮点击后界面没有变化，需要对这两个功能做出差异化。

### 7.3 设计思路

#### 态势显示模式 (`map`)
- 聚焦于地图全屏显示
- 自动隐藏左侧面板
- 在地图右上角显示实时统计信息（在线目标数、高精度/中等/低质量信号数量）
- 在地图底部显示快速目标列表（可横向滚动，显示前10个目标）
- 点击底部目标可快速定位到该飞机

#### 目标列表模式 (`planes`)
- 自动显示左侧面板
- 显示完整的飞机列表和详情
- 地图作为辅助显示
- 可在左侧列表中搜索和选择目标

### 7.4 修改内容

#### 1. 修改导航按钮点击事件
- 态势显示按钮点击调用 `switchToMapView()` 函数
- 目标列表按钮点击调用 `switchToPlanesView()` 函数

#### 2. 新增视图切换函数
- `switchToMapView()`: 切换到态势显示模式，自动隐藏左侧面板
- `switchToPlanesView()`: 切换到目标列表模式，自动显示左侧面板

#### 3. 新增 `selectAndFocusPlane()` 函数
- 选择飞机并将地图视图移动到该飞机位置

#### 4. 修改左侧面板显示条件
- 态势显示模式下自动隐藏左侧面板和折叠按钮
- 目标列表模式下正常显示

#### 5. 新增态势显示模式覆盖层
- 右上角统计面板：显示在线目标数、高精度/中等/低质量信号统计
- 底部快速目标列表：横向滚动显示前10个目标，点击可定位

#### 6. 新增对应的CSS样式
- `.situation-info` / `.situation-stats` / `.situation-stat` 系列样式
- `.quick-targets` / `.quick-target-item` 系列样式
- `.map-overlay.bottom-center` 底部覆盖层定位样式

### 7.5 效果

| 功能 | 态势显示模式 | 目标列表模式 |
|------|-------------|-------------|
| 左侧面板 | 自动隐藏 | 自动显示 |
| 右上角信息 | 显示实时统计 | 无 |
| 底部快速列表 | 显示前10个目标 | 无 |
| 地图占比 | 全屏 | 与左侧面板共存 |
| 适用场景 | 整体态势监控 | 详细目标管理 |

---

## 完整修改总结（更新）

| 序号 | 优化项 | 涉及文件 | 状态 |
|------|--------|----------|------|
| 1 | 顶部导航栏模式指示器 | Map.vue | ✅ 完成 |
| 2 | 关闭浮窗返回模拟模式 | Map.vue | ✅ 完成 |
| 3 | 停止回放保留状态 | Map.vue, recorder.ts | ✅ 完成 |
| 4 | 回放只显示录制飞机 | Map.vue | ✅ 完成 |
| 5 | 停止后继续播放 | recorder.ts | ✅ 完成 |
| 6 | 回放模式数据源显示优化 | Map.vue | ✅ 完成 |
| 7 | 态势显示与目标列表差异化 | Map.vue | ✅ 完成 |

---

## 八、态势显示底部目标列表优化

**记录时间**：2025年12月19日 17:05

### 8.1 修改文件
- `src/components/Map.vue`

### 8.2 问题描述
态势显示模式底部的快速目标列表只显示前10个飞机，且数量与地图上显示的飞机不一致，列表一直在变化。

### 8.3 修改内容

#### 1. 新增按 NIC 排序的计算属性 `planesListByNic`
- 只包含有有效位置的飞机（与地图显示一致）
- 按 NIC 从高到低排序（信号质量好的排在前面）

#### 2. 修改底部目标列表
- 移除 `.slice(0, 10)` 限制，显示全部飞机
- 使用 `planesListByNic` 替代 `planesList`
- 添加标题栏显示目标总数和排序说明

#### 3. 优化样式
- 添加标题栏样式（`.quick-targets-header`）
- 扩大列表最大宽度到 90%
- 优化滚动条样式（更明显的渐变色）
- 添加 `flex-shrink: 0` 防止项目被压缩
- 添加平滑滚动效果

### 8.4 效果

| 改进项 | 修改前 | 修改后 |
|--------|--------|--------|
| 显示数量 | 仅前10个 | 全部飞机 |
| 排序方式 | 按最近更新 | 按信号质量(NIC)从高到低 |
| 数据一致性 | 与地图不一致 | 只显示地图上有位置的飞机 |
| 标题信息 | 无 | 显示目标总数和排序说明 |
| 滚动体验 | 基础滚动 | 平滑滚动+优化滚动条 |

---

## 九、降低热力图颜色亮度

**记录时间**：2025年12月19日 21:30

### 9.1 修改文件
- `src/components/Map.vue`

### 9.2 问题描述
热力图显示的颜色累积多了会显得地图很亮，影响观察体验。

### 9.3 修改内容
修改 `createHeatmapLayer()` 函数中的渐变色配置：
- 中心点透明度：`0.15` → `0.06`（降低60%）
- 30%位置透明度：`0.08` → `0.03`（降低62%）
- 60%位置透明度：`0.02` → `0.008`（降低60%）
- 饱和度：`100%` → `80%`
- 亮度：`60%/50%` → `45%/40%`

### 9.4 效果
热力图累积时更加柔和，不会使地图过亮，适合长时间观察。

---

## 十、飞机锁定跟踪功能

**记录时间**：2025年12月19日 17:35

### 10.1 修改文件
- `src/components/Map.vue`

### 10.2 问题描述
用户希望在态势显示模式下，点击底部目标列表中的飞机图标时，地图上出现红框锁定该飞机并跟随飞机移动，保证飞机始终在地图中心。

### 10.3 修改内容

#### 1. 新增状态变量
- `lockedPlaneId`: 锁定跟踪的飞机ID
- `lockBoxMarker`: 锁定框标记

#### 2. 新增锁定框相关函数
- `createLockBoxIcon()`: 创建锁定框图标
- `updateLockBox()`: 更新锁定框位置
- `removeLockBox()`: 移除锁定框

#### 3. 修改 `selectAndFocusPlane()` 函数
- 点击已锁定飞机时取消锁定
- 点击新飞机时锁定并跟随

#### 4. 修改 `updateMap()` 函数
- 添加锁定飞机的跟随逻辑
- 地图自动跟随锁定飞机移动
- 锁定飞机消失时自动取消锁定

#### 5. 修改 `clearCurrentState()` 函数
- 清空状态时同时清除锁定状态

#### 6. 修改底部目标列表显示
- 锁定的飞机显示🔒图标
- 锁定状态有红色高亮和呼吸动画

#### 7. 新增CSS样式
- `.lock-box`: 红色发光边框，带四角装饰和脉冲动画
- `.lock-box-icon`: 锁定框图标容器
- `.quick-target-item.locked`: 底部列表锁定状态样式

### 10.4 效果

| 功能 | 说明 |
|------|------|
| 锁定飞机 | 点击底部目标列表中的飞机，地图上显示红色锁定框 |
| 自动跟随 | 地图持续跟随锁定飞机移动，飞机始终在中心 |
| 取消锁定 | 再次点击同一飞机可取消锁定 |
| 视觉反馈 | 地图红框+底部列表🔒图标+红色高亮 |

---

## 十一、修复切换飞机时地图未完整加载问题

**记录时间**：2025年12月19日 17:40

### 11.1 修改文件
- `src/components/Map.vue`

### 11.2 问题描述
从一架飞机切换锁定到另一架飞机时，软件右边（系统日志底部）总有一块地图没有加载出来。

### 11.3 修改内容
修改 `selectAndFocusPlane()` 函数，在地图移动后延迟调用 `invalidateSize()` 刷新地图尺寸：
- 使用 `nextTick` + `setTimeout(100ms)` 确保DOM更新完成后再刷新
- 调用 `map.invalidateSize({ animate: false })` 强制重新计算地图尺寸

### 11.4 效果
切换锁定飞机时，地图能够完整加载，不再出现未渲染区域。

---

## 完整修改总结（最终）

| 序号 | 优化项 | 涉及文件 | 状态 |
|------|--------|----------|------|
| 1 | 顶部导航栏模式指示器 | Map.vue | ✅ 完成 |
| 2 | 关闭浮窗返回模拟模式 | Map.vue | ✅ 完成 |
| 3 | 停止回放保留状态 | Map.vue, recorder.ts | ✅ 完成 |
| 4 | 回放只显示录制飞机 | Map.vue | ✅ 完成 |
| 5 | 停止后继续播放 | recorder.ts | ✅ 完成 |
| 6 | 回放模式数据源显示优化 | Map.vue | ✅ 完成 |
| 7 | 态势显示与目标列表差异化 | Map.vue | ✅ 完成 |
| 8 | 态势显示底部目标列表优化 | Map.vue | ✅ 完成 |
| 9 | 降低热力图颜色亮度 | Map.vue | ✅ 完成 |
| 10 | 飞机锁定跟踪功能 | Map.vue | ✅ 完成 |
| 11 | 修复切换飞机时地图未加载问题 | Map.vue | ✅ 完成 |
