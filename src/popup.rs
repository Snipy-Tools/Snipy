use crate::selection::Settings;
use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::WindowEvent;
use tao::event_loop::EventLoopWindowTarget;
use tao::platform::windows::WindowBuilderExtWindows;
use tao::window::{Window, WindowBuilder};
use wry::{WebView, WebViewBuilder};

const SIZE: LogicalSize<f64> = LogicalSize::new(360.0, 280.0);
const MARGIN: f64 = 12.0;
const TASKBAR: f64 = 48.0;

fn svg_data_uri(svg: &str) -> String {
    let encoded = svg
        .trim()
        .replace('%', "%25")
        .replace('#', "%23")
        .replace('<', "%3C")
        .replace('>', "%3E")
        .replace('"', "%22")
        .replace(['\r', '\n'], " ");
    format!("data:image/svg+xml;utf8,{encoded}")
}

pub struct Popup {
    window: Window,
    webview: WebView,
    settings: Arc<Settings>,
    last_hidden: Instant,
}

impl Popup {
    pub fn new<T>(target: &EventLoopWindowTarget<T>, settings: Arc<Settings>) -> Self {
        let window = WindowBuilder::new()
            .with_decorations(false)
            .with_always_on_top(true)
            .with_resizable(false)
            .with_skip_taskbar(true)
            .with_visible(false)
            .with_inner_size(SIZE)
            .build(target)
            .expect("popup failed to build");

        let html = include_str!("./ui/index.html")
            .replace("{{LOGO}}", &svg_data_uri(include_str!("./assets/snipy.svg")));

        let ipc_settings = Arc::clone(&settings);
        let webview = WebViewBuilder::new()
            .with_html(html)
            .with_ipc_handler(move |req| {
                let msg = req.body().as_str();
                if msg == "quit" {
                    std::process::exit(0);
                } else if let Some(on) = msg.strip_prefix("enabled:") {
                    ipc_settings.enabled.store(on == "true", Ordering::Relaxed);
                } else if let Some(v) = msg.strip_prefix("trigger:").and_then(|v| v.parse().ok()) {
                    ipc_settings.trigger.store(v, Ordering::Relaxed);
                } else if let Some(v) = msg.strip_prefix("minlen:").and_then(|v| v.parse().ok()) {
                    ipc_settings.min_len.store(v, Ordering::Relaxed);
                }
            })
            .build(&window)
            .expect("webview failed to build");

        Self { window, webview, settings, last_hidden: Instant::now() }
    }

    fn refresh(&self) {
        let enabled = self.settings.enabled.load(Ordering::Relaxed);
        let trigger = self.settings.trigger.load(Ordering::Relaxed);
        let minlen = self.settings.min_len.load(Ordering::Relaxed);
        self.webview
            .evaluate_script(&format!("render({{enabled:{enabled},trigger:{trigger},minlen:{minlen}}})"))
            .ok();
    }

    pub fn toggle(&mut self) {
    if self.window.is_visible() || self.last_hidden.elapsed() < Duration::from_millis(200) {
        self.hide();
        return;
    }

    self.refresh();

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
