use std::sync::{Arc, mpsc};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::spawn;
use std::thread::sleep;
use std::time::{Duration, Instant};
use rdev::{EventType, Button};

pub fn start() -> Arc<AtomicBool> {
    let enabled = Arc::new(AtomicBool::new(true));
    let simulating = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<()>();
    
    let enabled_hook = Arc::clone(&enabled);
    let simulating_clone = Arc::clone(&simulating);
    spawn(move || for _ in rx { copy_selection(&simulating_clone) });

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
                if (dragged || double) && enabled_hook.load(Ordering::Relaxed)&&!simulating.load(Ordering::Relaxed) {
                    tx.send(()).ok();
                }
            }
            _ => {}
        }).expect("listen failed");
    });
    enabled
}


fn copy_selection(simulating: &Arc<AtomicBool>) {
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
    
    arboard::Clipboard::new().and_then(|mut clipboard| {
            clipboard.get_text().map(|text| {
                println!("Clipboard text: {}", text);
            })
        }).ok();
        
        
        
        simulating.store(false, Ordering::Relaxed);
}

fn dist(a: (f64, f64), b: (f64, f64)) -> f64 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()    
}
