/**
 * ADS-B 数据录制与回放工具
 * 
 * 功能:
 * - 录制 ADS-B 信号和飞机状态
 * - 导出/导入录制数据
 * - 时间轴回放控制
 * - 播放速度调整
 */

// ==================== 数据结构定义 ====================

/**
 * 录制的单个事件
 */
export interface RecordedEvent {
  timestamp: number;        // 相对录制开始的时间（毫秒）
  type: 'message' | 'init'; // 事件类型
  data: {
    hexMessage?: string;    // ADS-B hex 消息
    truthStates?: Array<{   // 初始真实飞机状态（仅 init 事件）
      id: string;
      lat: number;
      lng: number;
      heading: number;
      speed: number;
      altitude: number;
      nic: number;
      callsign: string;
    }>;
  };
}

/**
 * 完整的录制会话
 */
export interface RecordingSession {
  version: string;          // 格式版本（用于未来兼容性）
  recordedAt: string;       // 录制时间（ISO 格式）
  duration: number;         // 总时长（毫秒）
  mapConfig: {              // 地图初始配置
    center: [number, number];
    zoom: number;
  };
  events: RecordedEvent[];  // 事件序列
  metadata?: {              // 可选元数据
    description?: string;
    tags?: string[];
  };
}

// ==================== 录制器类 ====================

export class AdsbRecorder {
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private events: RecordedEvent[] = [];
  private mapConfig: { center: [number, number]; zoom: number } = { center: [0, 0], zoom: 10 };

  /**
   * 开始录制
   */
  startRecording(mapCenter: [number, number], mapZoom: number, truthAircrafts?: Map<string, any>) {
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.events = [];
    this.mapConfig = { center: mapCenter, zoom: mapZoom };

    // 记录初始状态事件
    if (truthAircrafts && truthAircrafts.size > 0) {
      const truthStates = Array.from(truthAircrafts.values()).map(a => ({
        id: a.id,
        lat: a.lat,
        lng: a.lng,
        heading: a.heading,
        speed: a.speed,
        altitude: a.altitude,
        nic: a.nic,
        callsign: a.callsign
      }));

      this.events.push({
        timestamp: 0,
        type: 'init',
        data: { truthStates }
      });
    }

    console.log(`[Recorder] 📹 Recording started at ${new Date().toISOString()}`);
  }

  /**
   * 停止录制并返回会话数据
   */
  stopRecording(): RecordingSession | null {
    if (!this.isRecording) {
      console.warn('[Recorder] ⚠️ Not currently recording');
      return null;
    }

    this.isRecording = false;
    const duration = Date.now() - this.recordingStartTime;

    const session: RecordingSession = {
      version: '1.0.0',
      recordedAt: new Date(this.recordingStartTime).toISOString(),
      duration,
      mapConfig: this.mapConfig,
      events: this.events,
      metadata: {
        description: `ADS-B Recording - ${this.events.length} events`,
        tags: ['adsb', 'simulation']
      }
    };

    console.log(`[Recorder] ⏹️ Recording stopped. Duration: ${(duration / 1000).toFixed(1)}s, Events: ${this.events.length}`);
    return session;
  }

  /**
   * 记录一条 ADS-B 消息
   */
  recordMessage(hexMessage: string) {
    if (!this.isRecording) return;

    const timestamp = Date.now() - this.recordingStartTime;
    this.events.push({
      timestamp,
      type: 'message',
      data: { hexMessage }
    });
  }

  /**
   * 获取当前录制状态
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      eventCount: this.events.length,
      duration: this.isRecording ? Date.now() - this.recordingStartTime : 0
    };
  }
}

// ==================== 回放引擎类 ====================

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished';

export class ReplayEngine {
  private session: RecordingSession | null = null;
  private state: PlaybackState = 'idle';
  private currentEventIndex: number = 0;
  private playbackStartTime: number = 0;
  private pausedAt: number = 0;
  private playbackSpeed: number = 1.0; // 播放速度倍率
  private animationFrameId: number | null = null;
  
  // 回调函数
  private onMessageCallback?: (hexMessage: string, timestamp: number) => void;
  private onBatchUpdateCallback?: () => void; // 批量更新完成后的回调
  private onProgressCallback?: (progress: number, currentTime: number, totalTime: number) => void;
  private onStateChangeCallback?: (state: PlaybackState) => void;
  private onFinishCallback?: () => void;

  /**
   * 加载录制会话
   */
  loadSession(session: RecordingSession): boolean {
    try {
      // 验证格式
      if (!session.version || !session.events || !Array.isArray(session.events)) {
        console.error('[Replay] ❌ Invalid session format');
        return false;
      }

      this.session = session;
      this.reset();
      console.log(`[Replay] 📂 Loaded session: ${session.events.length} events, duration: ${(session.duration / 1000).toFixed(1)}s`);
      return true;
    } catch (error) {
      console.error('[Replay] ❌ Failed to load session:', error);
      return false;
    }
  }

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

    if (this.state === 'paused') {
      // 从暂停位置继续
      const pausedDuration = this.pausedAt;
      this.playbackStartTime = Date.now() - pausedDuration;
    } else {
      // 从头开始
      this.playbackStartTime = Date.now();
    }

    this.state = 'playing';
    this.onStateChangeCallback?.('playing');
    this.scheduleNextEvent();
    console.log(`[Replay] ▶️ Playback started/resumed at speed ${this.playbackSpeed}x`);
  }

  /**
   * 暂停播放
   */
  pause() {
    if (this.state !== 'playing') return;

    this.state = 'paused';
    this.pausedAt = Date.now() - this.playbackStartTime;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.onStateChangeCallback?.('paused');
    console.log(`[Replay] ⏸️ Playback paused at ${(this.pausedAt / 1000).toFixed(1)}s`);
  }

  /**
   * 停止播放并重置
   */
  stop() {
    this.state = 'idle';
    this.reset();
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.onStateChangeCallback?.('idle');
    console.log('[Replay] ⏹️ Playback stopped');
  }

  /**
   * 跳转到指定时间（毫秒）
   */
  seekTo(timeMs: number) {
    if (!this.session) return;

    const targetTime = Math.max(0, Math.min(timeMs, this.session.duration));
    
    // 找到目标时间对应的事件索引
    this.currentEventIndex = this.session.events.findIndex(e => e.timestamp >= targetTime);
    if (this.currentEventIndex === -1) {
      this.currentEventIndex = this.session.events.length;
    }

    // 如果正在播放，调整播放起始时间
    if (this.state === 'playing') {
      this.playbackStartTime = Date.now() - targetTime;
    } else if (this.state === 'paused') {
      this.pausedAt = targetTime;
    }

    this.updateProgress();
    console.log(`[Replay] ⏩ Seeked to ${(targetTime / 1000).toFixed(1)}s`);
  }

  /**
   * 设置播放速度
   */
  setSpeed(speed: number) {
    const wasPlaying = this.state === 'playing';
    
    if (wasPlaying) {
      // 计算当前的回放时间（已经乘过旧速度的时间）
      const currentPlaybackTime = (Date.now() - this.playbackStartTime) * this.playbackSpeed;
      // 更新速度
      this.playbackSpeed = speed;
      // 反算新的起始时间，使得 currentPlaybackTime 保持不变
      // currentPlaybackTime = (Date.now() - newStartTime) * newSpeed
      // newStartTime = Date.now() - currentPlaybackTime / newSpeed
      this.playbackStartTime = Date.now() - currentPlaybackTime / speed;
    } else if (this.state === 'paused') {
      // 暂停状态下，pausedAt 已经是回放时间，不需要调整
      this.playbackSpeed = speed;
    } else {
      this.playbackSpeed = speed;
    }

    console.log(`[Replay] 🎚️ Speed changed to ${speed}x`);
  }

  /**
   * 注册回调函数
   */
  onMessage(callback: (hexMessage: string, timestamp: number) => void) {
    this.onMessageCallback = callback;
  }

  onBatchUpdate(callback: () => void) {
    this.onBatchUpdateCallback = callback;
  }

  onProgress(callback: (progress: number, currentTime: number, totalTime: number) => void) {
    this.onProgressCallback = callback;
  }

  onStateChange(callback: (state: PlaybackState) => void) {
    this.onStateChangeCallback = callback;
  }

  onFinish(callback: () => void) {
    this.onFinishCallback = callback;
  }

  /**
   * 获取当前状态信息
   */
  getStatus() {
    const currentTime = this.state === 'playing' 
      ? (Date.now() - this.playbackStartTime) * this.playbackSpeed
      : this.pausedAt;
    
    return {
      state: this.state,
      speed: this.playbackSpeed,
      currentTime: currentTime,
      totalTime: this.session?.duration || 0,
      progress: this.session 
        ? Math.min((currentTime / this.session.duration) * 100, 100)
        : 0
    };
  }

  /**
   * 获取当前加载的会话
   */
  getSession(): RecordingSession | null {
    return this.session;
  }

  /**
   * 获取指定时间之前的所有消息事件（用于轨迹重建）
   * @param targetTimeMs 目标时间（毫秒）
   * @returns 消息事件数组，每个元素包含 hexMessage 和 timestamp
   */
  getEventsUpTo(targetTimeMs: number): Array<{ hexMessage: string; timestamp: number }> {
    if (!this.session) return [];
    
    return this.session.events
      .filter(e => e.type === 'message' && e.data.hexMessage && e.timestamp <= targetTimeMs)
      .map(e => ({
        hexMessage: e.data.hexMessage!,
        timestamp: e.timestamp
      }));
  }

  // ==================== 私有方法 ====================

  private reset() {
    this.currentEventIndex = 0;
    this.playbackStartTime = 0;
    this.pausedAt = 0;
  }

  private scheduleNextEvent() {
    if (!this.session || this.state !== 'playing') return;

    // 使用 requestAnimationFrame 实现高精度时间控制
    this.animationFrameId = requestAnimationFrame(() => {
      this.processEvents();
    });
  }

  private processEvents() {
    if (!this.session || this.state !== 'playing') return;

    const currentPlaybackTime = (Date.now() - this.playbackStartTime) * this.playbackSpeed;
    let processedCount = 0;

    // 处理所有应该在当前时间点之前发生的事件
    while (
      this.currentEventIndex < this.session.events.length &&
      this.session.events[this.currentEventIndex].timestamp <= currentPlaybackTime
    ) {
      const event = this.session.events[this.currentEventIndex];
      
      if (event.type === 'message' && event.data.hexMessage) {
        this.onMessageCallback?.(event.data.hexMessage, event.timestamp);
        processedCount++;
      }

      this.currentEventIndex++;
    }

    // 先更新进度，确保 playbackCurrentTime 是最新值
    this.updateProgress();

    // 如果处理了至少一个事件，触发批量更新回调
    if (processedCount > 0) {
      this.onBatchUpdateCallback?.();
    }

    // 检查是否完成
    if (this.currentEventIndex >= this.session.events.length) {
      this.state = 'finished';
      this.onStateChangeCallback?.('finished');
      this.onFinishCallback?.();
      console.log('[Replay] ✅ Playback finished');
      return;
    }

    // 继续调度
    this.scheduleNextEvent();
  }

  private updateProgress() {
    if (!this.session) return;

    const currentTime = this.state === 'playing' 
      ? (Date.now() - this.playbackStartTime) * this.playbackSpeed
      : this.pausedAt;
    
    // 返回 0-100 的百分比值，方便 UI 的 range slider 使用
    const progress = Math.min((currentTime / this.session.duration) * 100, 100);
    this.onProgressCallback?.(progress, currentTime, this.session.duration);
  }
}

// ==================== 持久化工具 ====================

export class StorageManager {
  /**
   * 保存录制到 LocalStorage
   */
  static saveToLocalStorage(key: string, session: RecordingSession): boolean {
    try {
      const json = JSON.stringify(session);
      localStorage.setItem(key, json);
      console.log(`[Storage] 💾 Saved to localStorage: ${key} (${(json.length / 1024).toFixed(1)} KB)`);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to save to localStorage:', error);
      return false;
    }
  }

  /**
   * 从 LocalStorage 加载录制
   */
  static loadFromLocalStorage(key: string): RecordingSession | null {
    try {
      const json = localStorage.getItem(key);
      if (!json) return null;

      const session = JSON.parse(json) as RecordingSession;
      console.log(`[Storage] 📂 Loaded from localStorage: ${key}`);
      return session;
    } catch (error) {
      console.error('[Storage] ❌ Failed to load from localStorage:', error);
      return null;
    }
  }

  /**
   * 下载录制为 JSON 文件
   */
  static downloadAsFile(session: RecordingSession, filename?: string) {
    try {
      const json = JSON.stringify(session, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `adsb-recording-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`[Storage] 💾 Downloaded as file: ${a.download} (${(json.length / 1024).toFixed(1)} KB)`);
    } catch (error) {
      console.error('[Storage] ❌ Failed to download file:', error);
    }
  }

  /**
   * 从文件加载录制
   */
  static loadFromFile(file: File): Promise<RecordingSession | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const json = e.target?.result as string;
          const session = JSON.parse(json) as RecordingSession;
          console.log(`[Storage] 📂 Loaded from file: ${file.name}`);
          resolve(session);
        } catch (error) {
          console.error('[Storage] ❌ Failed to parse file:', error);
          resolve(null);
        }
      };

      reader.onerror = () => {
        console.error('[Storage] ❌ Failed to read file');
        resolve(null);
      };

      reader.readAsText(file);
    });
  }

  /**
   * 列出 LocalStorage 中的所有录制
   */
  static listRecordings(prefix: string = 'adsb-recording-'): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * 删除 LocalStorage 中的录制
   */
  static deleteRecording(key: string): boolean {
    try {
      localStorage.removeItem(key);
      console.log(`[Storage] 🗑️ Deleted recording: ${key}`);
      return true;
    } catch (error) {
      console.error('[Storage] ❌ Failed to delete recording:', error);
      return false;
    }
  }
}
