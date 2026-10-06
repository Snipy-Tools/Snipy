mod popup;
mod tray;

use popup::Popup;
use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray::{Tray, UserEvent};

fn main() {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    let tray = Tray::new(&event_loop);
    let mut popup = Popup::new(&event_loop);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent { event, .. } => popup.handle_event(&event),
            Event::UserEvent(e) => tray.handle_event(e, &mut popup, control_flow),
            _ => {}
        }
    });
}
