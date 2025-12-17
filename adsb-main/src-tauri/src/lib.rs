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

impl Default for SimulationConfig {
    fn default() -> Self {
        SimulationConfig {
            center_lat: 22.5431,   // 深圳
            center_lng: 114.0579,
            aircraft_count: 12,
            update_interval_ms: 1000,
        }
    }
}

/// ADS-B 消息批量事件
#[derive(Clone, Serialize)]
struct AdsbBatchEvent {
    messages: Vec<AdsbEvent>,
    aircrafts: Vec<Aircraft>,
    timestamp: u64,
}

/// 启动模拟
#[tauri::command]
fn start_simulation(
    app: AppHandle,
    state: State<SimulatorState>,
    config: Option<SimulationConfig>,
) -> Result<String, String> {
    let config = config.unwrap_or_default();
    
    // 检查是否已在运行
    {
        let is_running = state.is_running.lock().map_err(|e| e.to_string())?;
        if *is_running {
            return Err("Simulation already running".to_string());
        }
    }

    // 初始化模拟器
    {
        let mut simulator = state.simulator.lock().map_err(|e| e.to_string())?;
        *simulator = AdsbSimulator::new(config.center_lat, config.center_lng);
        simulator.generate_mock_aircrafts(config.aircraft_count);
    }

    // 设置运行状态
    {
        let mut is_running = state.is_running.lock().map_err(|e| e.to_string())?;
        *is_running = true;
    }

    // 克隆状态用于线程
    let simulator = Arc::clone(&state.simulator);
    let is_running = Arc::clone(&state.is_running);
    let interval = config.update_interval_ms;

    // 启动后台线程
    thread::spawn(move || {
        let mut tick = 0u64;
        
        loop {
            // 检查是否应该停止
            {
                let running = is_running.lock().unwrap();
                if !*running {
                    break;
                }
            }

            // 更新飞机位置并生成消息
            let (messages, aircrafts) = {
                let mut sim = simulator.lock().unwrap();
                sim.update_positions();
                (sim.generate_all_messages(), sim.get_aircrafts().clone())
            };

            // 发送事件到前端
            let event = AdsbBatchEvent {
                messages,
                aircrafts,
                timestamp: tick * interval,
            };

            if let Err(e) = app.emit("adsb-batch", &event) {
                eprintln!("[Rust] Failed to emit event: {}", e);
            }

            tick += 1;
            thread::sleep(Duration::from_millis(interval));
        }

        println!("[Rust] Simulation thread stopped");
    });

    Ok("Simulation started".to_string())
}

/// 停止模拟
#[tauri::command]
fn stop_simulation(state: State<SimulatorState>) -> Result<String, String> {
    let mut is_running = state.is_running.lock().map_err(|e| e.to_string())?;
    *is_running = false;
    Ok("Simulation stopped".to_string())
}

/// 获取当前飞机数据
#[tauri::command]
fn get_aircrafts(state: State<SimulatorState>) -> Result<Vec<Aircraft>, String> {
    let simulator = state.simulator.lock().map_err(|e| e.to_string())?;
    Ok(simulator.get_aircrafts().clone())
}

/// 检查模拟状态
#[tauri::command]
fn get_simulation_status(state: State<SimulatorState>) -> Result<bool, String> {
    let is_running = state.is_running.lock().map_err(|e| e.to_string())?;
    Ok(*is_running)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SimulatorState {
            simulator: Arc::new(Mutex::new(AdsbSimulator::new(22.5431, 114.0579))),
            is_running: Arc::new(Mutex::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            start_simulation,
            stop_simulation,
            get_aircrafts,
            get_simulation_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
