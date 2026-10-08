use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE, REG_SZ, RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
    RegSetValueExW,
};
use windows::core::{PCWSTR, w};

const RUN_KEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Run");
const VALUE: PCWSTR = w!("Snipy");

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
