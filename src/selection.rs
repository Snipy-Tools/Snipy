use std::sync::{Arc, mpsc};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::thread::spawn;
use std::thread::sleep;
use std::time::{Duration, Instant};
use rdev::{EventType, Button};
use tao::event_loop::EventLoopProxy;
use windows::Win32::Foundation::POINT;
use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
use crate::tray::UserEvent;

pub struct Settings {
    pub enabled: AtomicBool,
    pub trigger: AtomicU8,
    pub min_len: AtomicUsize,
}

pub fn start(proxy: EventLoopProxy<UserEvent>) -> Arc<Settings> {
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
        let mut last_click = Instant::now() - Duration::from_secs(1);
        rdev::listen(move |e| match e.event_type {
            EventType::MouseMove { x, y } => pos = (x, y), 
            EventType::ButtonPress(Button::Left) => down_pos = pos,
            EventType::KeyPress(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = true,
            EventType::KeyRelease(rdev::Key::ControlLeft | rdev::Key::ControlRight) => ctrl_down = false,
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
