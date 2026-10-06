use std::time::{Duration, Instant};
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::WindowEvent;
use tao::event_loop::EventLoopWindowTarget;
use tao::platform::windows::WindowBuilderExtWindows;
use tao::window::{Window, WindowBuilder};

const SIZE: LogicalSize<f64> = LogicalSize::new(360.0, 420.0);
const MARGIN: f64 = 12.0;
const TASKBAR: f64 = 48.0;

pub struct Popup {
    window: Window,
    last_hidden: Instant,
}

impl Popup {
    pub fn new<T>(target: &EventLoopWindowTarget<T>) -> Self {
        let window = WindowBuilder::new()
            .with_decorations(false)
            .with_always_on_top(true)
            .with_resizable(false)
            .with_skip_taskbar(true)
            .with_visible(false)
            .with_inner_size(SIZE)
            .build(target)
            .expect("popup failed to build");

        Self { window, last_hidden: Instant::now() }
    }

    pub fn toggle(&mut self) {
    if self.window.is_visible() || self.last_hidden.elapsed() < Duration::from_millis(200) {
        self.hide();
        return;
    }

    if let Some(monitor) = self.window.primary_monitor() {
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let mon = monitor.size();
        let win = self.window.outer_size();

        let x = pos.x as f64 + mon.width as f64 - win.width as f64 - MARGIN * scale;
        let y = pos.y as f64 + mon.height as f64 - win.height as f64 - (TASKBAR + MARGIN) * scale;
        self.window.set_outer_position(PhysicalPosition::new(x, y));
    }

    self.window.set_visible(true);
    self.window.set_focus();
}

    pub fn hide(&mut self) {
        if self.window.is_visible() {
            self.window.set_visible(false);
            self.last_hidden = Instant::now();
        }
    }

    pub fn handle_event(&mut self, event: &WindowEvent) {
        match event {
            WindowEvent::Focused(false) | WindowEvent::CloseRequested => self.hide(),
            _ => {}
        }
    }
}
