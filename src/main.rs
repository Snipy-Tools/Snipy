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

fn main() {
    let data_dir = std::env::var_os("LOCALAPPDATA").map(|p| std::path::PathBuf::from(p).join("Snipy"));
    let mut web_context = WebContext::new(data_dir);

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

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
