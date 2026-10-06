use std::sync::{Arc, mpsc};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::thread::spawn;
use std::thread::sleep;
use std::time::{Duration, Instant};
use rdev::{EventType, Button};

pub struct Settings {
    pub enabled: AtomicBool,
    pub trigger: AtomicU8,
    pub min_len: AtomicUsize,
}

pub fn start() -> Arc<Settings> {
    let settings = Arc::new(Settings {
        enabled: AtomicBool::new(true),
        trigger: AtomicU8::new(0),
        min_len: AtomicUsize::new(1),
    });
    let simulating = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<()>();
    
    let hook_settings = Arc::clone(&settings);
    let copy_settings = Arc::clone(&settings);
    let simulating_clone = Arc::clone(&simulating);
    spawn(move || for _ in rx { copy_selection(&simulating_clone, &copy_settings) });

    spawn(move || { 
        let mut down_pos = (0.0_f64, 0.0_f64);
        let mut pos = (0.0_f64, 0.0_f64);
        let mut ctrl_down = false;
        let mut last_click = Instant::now() - Duration::from_secs(1);
        rdev::listen(move |e| match e.event_type {
            EventType::MouseMove { x, y } => pos = (x, y), 
            EventType::ButtonPress(Button::Left) => down_pos = pos,
            EventType::KeyPress(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = true,
            EventType::KeyRelease(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = false,
            EventType::KeyPress(rdev::Key::KeyA) if ctrl_down => {
                if enabled_hook.load(Ordering::Relaxed) && !simulating.load(Ordering::Relaxed) {
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

fn copy_selection(simulating: &Arc<AtomicBool>, settings: &Settings) {
    let min_len = settings.min_len.load(Ordering::Relaxed);
    let before = if min_len > 1 { clipboard_text() } else { None };
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
    sleep(Duration::from_millis(80));
    
    if let Some(before) = before {
        if clipboard_text().is_some_and(|t| t.chars().count() < min_len) {
            arboard::Clipboard::new().and_then(|mut c| c.set_text(before)).ok();
        }
    }
}

fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()    
}
