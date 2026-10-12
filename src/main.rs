#![windows_subsystem = "windows"]

mod autostart;
mod popup;
mod tray;
mod selection;
mod toast;

use popup::Popup;
use toast::Toast;
use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray::{Tray, UserEvent};
use wry::WebContext;

fn data_dir() -> Option<std::path::PathBuf> {
    let home = || std::env::var_os("HOME").map(std::path::PathBuf::from);
    if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(|p| std::path::PathBuf::from(p).join("Snipy"))
    } else if cfg!(target_os = "macos") {
        home().map(|h| h.join("Library/Application Support/Snipy"))
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| home().map(|h| h.join(".local/share")))
            .map(|d| d.join("snipy"))
    }
}

fn main() {
    let data_dir = data_dir();
    let mut web_context = WebContext::new(data_dir);

    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
    let mut event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    #[cfg(target_os = "macos")]
    {
        use tao::platform::macos::{ActivationPolicy, EventLoopExtMacOS};
        event_loop.set_activation_policy(ActivationPolicy::Accessory);
    }

    let tray = Tray::new(&event_loop);
    let settings = selection::start(event_loop.create_proxy());
    let mut popup = Popup::new(&event_loop, &mut web_context, settings);
    let mut toast = Toast::new(&event_loop, &mut web_context);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent { event, .. } => popup.handle_event(&event),
            Event::UserEvent(e) => tray.handle_event(e, &mut popup, &mut toast, control_flow),
            _ => {}
        }

        toast.tick();
        if let (ControlFlow::Wait, Some(deadline)) = (*control_flow, toast.deadline()) {
            *control_flow = ControlFlow::WaitUntil(deadline);
        }
    });
}
