use std::time::{Duration, Instant};
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event_loop::EventLoopWindowTarget;
use tao::platform::windows::WindowBuilderExtWindows;
use tao::window::{Window, WindowBuilder};
use wry::{WebContext, WebView, WebViewBuilder};

const SIZE: LogicalSize<f64> = LogicalSize::new(110.0, 34.0);
const OFFSET: f64 = 20.0;
const VISIBLE_FOR: Duration = Duration::from_millis(1200);

pub struct Toast {
    window: Window,
    webview: WebView,
    hide_at: Option<Instant>,
}

impl Toast {
    pub fn new<T>(target: &EventLoopWindowTarget<T>, context: &mut WebContext) -> Self {
        let window = WindowBuilder::new()
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top(true)
            .with_resizable(false)
            .with_skip_taskbar(true)
            .with_focusable(false)
            .with_visible(false)
            .with_inner_size(SIZE)
            .build(target)
            .expect("toast failed to build");
        window.set_ignore_cursor_events(true).ok();

        let webview = WebViewBuilder::new_with_web_context(context)
            .with_transparent(true)
            .with_html(include_str!("./ui/toast.html"))
            .build(&window)
            .expect("toast webview failed to build");

        Self { window, webview, hide_at: None }
    }

    pub fn show(&mut self, x: i32, y: i32) {
        let scale = self.window.scale_factor();
        let width = self.window.outer_size().width as f64;
        self.window.set_outer_position(PhysicalPosition::new(
            x as f64 - width / 2.0,
            y as f64 + OFFSET * scale,
        ));
        self.webview.evaluate_script("show()").ok();
        self.window.set_visible(true);
        self.hide_at = Some(Instant::now() + VISIBLE_FOR);
    }

    pub fn deadline(&self) -> Option<Instant> {
        self.hide_at
    }

    pub fn tick(&mut self) {
        if self.hide_at.is_some_and(|t| Instant::now() >= t) {
            self.window.set_visible(false);
            self.hide_at = None;
        }
    }
}
