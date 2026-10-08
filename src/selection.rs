use std::sync::{Arc, Mutex, mpsc};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::thread::spawn;
use std::thread::sleep;
use std::time::{Duration, Instant};
use rdev::{EventType, Button, Key};
use tao::event_loop::EventLoopProxy;
use windows::Win32::Foundation::POINT;
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use crate::tray::UserEvent;

#[derive(Clone)]
pub struct Shortcut {
    ctrl: bool,
    alt: bool,
    shift: bool,
    code: String,
    key: Key,
}

impl Shortcut {
    fn default_toggle() -> Self {
        Self { ctrl: true, alt: true, shift: false, code: "KeyS".into(), key: Key::KeyS }
    }

    pub fn parse(spec: &str) -> Option<Self> {
        let mut shortcut = Self { ctrl: false, alt: false, shift: false, code: String::new(), key: Key::Unknown(0) };
        for part in spec.split('+') {
            match part {
                "ctrl" => shortcut.ctrl = true,
                "alt" => shortcut.alt = true,
                "shift" => shortcut.shift = true,
                code => {
                    shortcut.key = key_from_code(code)?;
                    shortcut.code = code.to_string();
                }
            }
        }
        let is_function_key = shortcut.code.starts_with('F');
        (shortcut.ctrl || shortcut.alt || is_function_key).then_some(shortcut)
    }

    pub fn label(&self) -> String {
        let mut parts = Vec::new();
        if self.ctrl { parts.push("Ctrl"); }
        if self.alt { parts.push("Alt"); }
        if self.shift { parts.push("Shift"); }
        let key = self.code.trim_start_matches("Key").trim_start_matches("Digit");
        parts.push(key);
        parts.join("+")
    }
}

fn key_from_code(code: &str) -> Option<Key> {
    Some(match code {
        "KeyA" => Key::KeyA, "KeyB" => Key::KeyB, "KeyC" => Key::KeyC, "KeyD" => Key::KeyD,
        "KeyE" => Key::KeyE, "KeyF" => Key::KeyF, "KeyG" => Key::KeyG, "KeyH" => Key::KeyH,
        "KeyI" => Key::KeyI, "KeyJ" => Key::KeyJ, "KeyK" => Key::KeyK, "KeyL" => Key::KeyL,
        "KeyM" => Key::KeyM, "KeyN" => Key::KeyN, "KeyO" => Key::KeyO, "KeyP" => Key::KeyP,
        "KeyQ" => Key::KeyQ, "KeyR" => Key::KeyR, "KeyS" => Key::KeyS, "KeyT" => Key::KeyT,
        "KeyU" => Key::KeyU, "KeyV" => Key::KeyV, "KeyW" => Key::KeyW, "KeyX" => Key::KeyX,
        "KeyY" => Key::KeyY, "KeyZ" => Key::KeyZ,
        "Digit0" => Key::Num0, "Digit1" => Key::Num1, "Digit2" => Key::Num2, "Digit3" => Key::Num3,
        "Digit4" => Key::Num4, "Digit5" => Key::Num5, "Digit6" => Key::Num6, "Digit7" => Key::Num7,
        "Digit8" => Key::Num8, "Digit9" => Key::Num9,
        "F1" => Key::F1, "F2" => Key::F2, "F3" => Key::F3, "F4" => Key::F4,
        "F5" => Key::F5, "F6" => Key::F6, "F7" => Key::F7, "F8" => Key::F8,
        "F9" => Key::F9, "F10" => Key::F10, "F11" => Key::F11, "F12" => Key::F12,
        _ => return None,
    })
}

pub struct Settings {
    pub enabled: AtomicBool,
    pub trigger: AtomicU8,
    pub min_len: AtomicUsize,
    pub shortcut: Mutex<Shortcut>,
}

pub fn start(proxy: EventLoopProxy<UserEvent>) -> Arc<Settings> {
    let settings = Arc::new(Settings {
        enabled: AtomicBool::new(true),
        trigger: AtomicU8::new(0),
        min_len: AtomicUsize::new(1),
        shortcut: Mutex::new(Shortcut::default_toggle()),
    });
    let simulating = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<()>();
    
    let hook_settings = Arc::clone(&settings);
    let copy_settings = Arc::clone(&settings);
    let simulating_clone = Arc::clone(&simulating);
    let toggle_proxy = proxy.clone();
    spawn(move || for _ in rx {
        if copy_selection(&simulating_clone, &copy_settings) {
            let mut p = POINT::default();
            unsafe { GetCursorPos(&mut p) }.ok();
            proxy.send_event(UserEvent::Copied(p.x, p.y)).ok();
        }
    });

    spawn(move || { 
        let mut down_pos = (0.0_f64, 0.0_f64);
        let mut pos = (0.0_f64, 0.0_f64);
        let mut ctrl_down = false;
        let mut alt_down = false;
        let mut shift_down = false;
        let mut last_click = Instant::now() - Duration::from_secs(1);
        rdev::listen(move |e| match e.event_type {
            EventType::MouseMove { x, y } => pos = (x, y), 
            EventType::ButtonPress(Button::Left) => down_pos = pos,
            EventType::KeyPress(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = true,
            EventType::KeyRelease(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = false,
            EventType::KeyPress(Key::Alt | Key::AltGr) => alt_down = true,
            EventType::KeyRelease(Key::Alt | Key::AltGr) => alt_down = false,
            EventType::KeyPress(Key::ShiftLeft | Key::ShiftRight) => shift_down = true,
            EventType::KeyRelease(Key::ShiftLeft | Key::ShiftRight) => shift_down = false,
            EventType::KeyPress(key) if !simulating.load(Ordering::Relaxed) && {
                let sc = hook_settings.shortcut.lock().unwrap();
                sc.key == key && sc.ctrl == ctrl_down && sc.alt == alt_down && sc.shift == shift_down
            } => {
                let enabled = !hook_settings.enabled.fetch_xor(true, Ordering::Relaxed);
                toggle_proxy.send_event(UserEvent::Toggled(enabled)).ok();
            }
            EventType::KeyPress(rdev::Key::KeyA) if ctrl_down => {
                if hook_settings.enabled.load(Ordering::Relaxed) && !simulating.load(Ordering::Relaxed) {
                    tx.send(()).ok();
            }
            }
            EventType::ButtonRelease(Button::Left) => {
                let dragged = dist(down_pos, pos) > 5.0;
                let double = last_click.elapsed() < Duration::from_millis(400);
                last_click = Instant::now();
                let triggered = match hook_settings.trigger.load(Ordering::Relaxed) {
                    1 => dragged,
                    2 => double,
                    _ => dragged || double,
                };
                if triggered && hook_settings.enabled.load(Ordering::Relaxed) && !simulating.load(Ordering::Relaxed) {
                    tx.send(()).ok();
                }
            }
            _ => {}
        }).expect("listen failed");
    });
    settings
}


fn clipboard_text() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok()
}

fn copy_selection(simulating: &Arc<AtomicBool>, settings: &Settings) -> bool {
    let min_len = settings.min_len.load(Ordering::Relaxed);
    let before = if min_len > 1 { clipboard_text() } else { None };
    let seq = unsafe { GetClipboardSequenceNumber() };
    simulating.store(true, Ordering::Relaxed);
    sleep(Duration::from_millis(50));
    rdev::simulate(&EventType::KeyPress(rdev::Key::ControlLeft)).ok();
    sleep(Duration::from_millis(10));
    rdev::simulate(&EventType::KeyPress(rdev::Key::KeyC)).ok();
    sleep(Duration::from_millis(10));
    rdev::simulate(&EventType::KeyRelease(rdev::Key::KeyC)).ok();
    sleep(Duration::from_millis(10));
    rdev::simulate(&EventType::KeyRelease(rdev::Key::ControlLeft)).ok();

    simulating.store(false, Ordering::Relaxed);
    let deadline = Instant::now() + Duration::from_millis(250);
    while unsafe { GetClipboardSequenceNumber() } == seq && Instant::now() < deadline {
        sleep(Duration::from_millis(5));
    }
    if unsafe { GetClipboardSequenceNumber() } == seq {
        return false;
    }
    if let Some(before) = before {
        if clipboard_text().is_some_and(|t| t.chars().count() < min_len) {
            arboard::Clipboard::new().and_then(|mut c| c.set_text(before)).ok();
            return false;
        }
    }
    true
}

fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()    
}
