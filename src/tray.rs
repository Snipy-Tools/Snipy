use resvg::{tiny_skia, usvg};
use tray_icon::menu::{Menu, MenuId, MenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder};

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

pub fn create() -> (TrayIcon, MenuId) {
    let quit = MenuItem::new("Quit", true, None);
    let menu = Menu::new();
    menu.append(&quit).expect("menu quit faild to build");

    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Snipy")
        .with_icon(load_icon())
        .build()
        .expect("icon faild to build");

    (tray, quit.id().clone())
}
