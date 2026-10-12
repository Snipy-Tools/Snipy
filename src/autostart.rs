#[cfg(windows)]
use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_SZ, RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
    RegSetValueExW,
};
#[cfg(windows)]
use windows::core::{PCWSTR, w};

#[cfg(windows)]
const RUN_KEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Run");
#[cfg(windows)]
const VALUE: PCWSTR = w!("Snipy");

#[cfg(windows)]
pub fn is_enabled() -> bool {
    let mut key = HKEY::default();
    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, RUN_KEY, None, KEY_READ, &mut key).is_err() {
            return false;
        }
        let found = RegQueryValueExW(key, VALUE, None, None, None, None).is_ok();
        let _ = RegCloseKey(key);
        found
    }
}

#[cfg(windows)]
pub fn set(enabled: bool) {
    let mut key = HKEY::default();
    unsafe {
        if RegOpenKeyExW(HKEY_CURRENT_USER, RUN_KEY, None, KEY_SET_VALUE, &mut key).is_err() {
            return;
        }
        if enabled {
            if let Ok(exe) = std::env::current_exe() {
                let command = format!("\"{}\"", exe.display());
                let wide: Vec<u16> = command.encode_utf16().chain(Some(0)).collect();
                let bytes = std::slice::from_raw_parts(wide.as_ptr().cast::<u8>(), wide.len() * 2);
                let _ = RegSetValueExW(key, VALUE, None, REG_SZ, Some(bytes));
            }
        } else {
            let _ = RegDeleteValueW(key, VALUE);
        }
        let _ = RegCloseKey(key);
    }
}

#[cfg(not(windows))]
fn entry_path() -> Option<std::path::PathBuf> {
    let home = std::path::PathBuf::from(std::env::var_os("HOME")?);
    Some(if cfg!(target_os = "macos") {
        home.join("Library/LaunchAgents/com.snipy.app.plist")
    } else {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        config.join("autostart/snipy.desktop")
    })
}

#[cfg(not(windows))]
pub fn is_enabled() -> bool {
    entry_path().is_some_and(|p| p.exists())
}

#[cfg(not(windows))]
pub fn set(enabled: bool) {
    let Some(path) = entry_path() else { return };
    if !enabled {
        let _ = std::fs::remove_file(path);
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let exe = exe.display();
    let content = if cfg!(target_os = "macos") {
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<plist version=\"1.0\">
<dict>
<key>Label</key><string>com.snipy.app</string>
<key>ProgramArguments</key><array><string>{exe}</string></array>
<key>RunAtLoad</key><true/>
</dict>
</plist>
"
        )
    } else {
        format!("[Desktop Entry]
Type=Application
Name=Snipy
Exec=\"{exe}\"
X-GNOME-Autostart-enabled=true
")
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, content);
}
