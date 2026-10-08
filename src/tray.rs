use crate::popup::Popup;
use crate::toast::Toast;
use resvg::{tiny_skia, usvg};
use tao::event_loop::{ControlFlow, EventLoop};
use tray_icon::menu::{Menu, MenuEvent, MenuId, MenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

const ICON_SIZE: u32 = 64;

fn load_icon() -> Icon {
    let svg = include_bytes!("assets/snipy.svg");
    let tree = usvg::Tree::from_data(svg, &usvg::Options::default()).expect("invalid svg");

    let mut pixmap = tiny_skia::Pixmap::new(ICON_SIZE, ICON_SIZE).expect("invalid icon size");
    let scale = ICON_SIZE as f32 / tree.size().width().max(tree.size().height());
    let transform = tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    Icon::from_rgba(pixmap.take_demultiplied(), ICON_SIZE, ICON_SIZE).expect("invalid icon data")
}

pub enum UserEvent {
    Tray(TrayIconEvent),
    Menu(MenuEvent),
    Copied(i32, i32),
    Toggled(bool),
}

pub struct Tray {
    icon: TrayIcon,
    quit_id: MenuId,
}

impl Tray {
    pub fn new(event_loop: &EventLoop<UserEvent>) -> Self {
        let proxy = event_loop.create_proxy();
        TrayIconEvent::set_event_handler(Some(move |e| {
            let _ = proxy.send_event(UserEvent::Tray(e));
        }));
        let proxy = event_loop.create_proxy();
        MenuEvent::set_event_handler(Some(move |e| {
            let _ = proxy.send_event(UserEvent::Menu(e));
        }));

        let quit = MenuItem::new("Quit", true, None);
        let menu = Menu::new();
        menu.append(&quit).expect("menu quit faild to build");

        let icon = TrayIconBuilder::new()
            .with_menu(Box::new(menu))
            .with_menu_on_left_click(false)
            .with_tooltip("Snipy")
            .with_icon(load_icon())
            .build()
            .expect("icon faild to build");

        Self {
            icon,
            quit_id: quit.id().clone(),
        }
    }

    pub fn handle_event(&self, event: UserEvent, popup: &mut Popup, toast: &mut Toast, control_flow: &mut ControlFlow) {
        match event {
            UserEvent::Tray(TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }) => popup.toggle(),
            UserEvent::Menu(e) if e.id == self.quit_id => *control_flow = ControlFlow::Exit,
            UserEvent::Copied(x, y) => toast.show(x, y),
            UserEvent::Toggled(enabled) => {
                self.icon.set_tooltip(Some(if enabled { "Snipy" } else { "Snipy (off)" })).ok();
                popup.sync();
            }
            _ => {}
        }
    }
}
