mod tray;

use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::MenuEvent;

fn main() {
    let event_loop = EventLoopBuilder::new().build();

    let (_tray, quit_id) = tray::create();

    event_loop.run(move |_event: Event<()>, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        if let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit_id {
                *control_flow = ControlFlow::Exit;
            }
        }
    });
}
