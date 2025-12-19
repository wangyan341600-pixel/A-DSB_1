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
