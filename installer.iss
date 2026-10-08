#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{B6E1F3A2-5C0D-4E8B-9A57-3D2F1C7E4A90}
AppName=Snipy
AppVersion={#AppVersion}
AppPublisher=Snipy
DefaultDirName={autopf}\Snipy
DefaultGroupName=Snipy
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\snipy.exe
SetupIconFile=src\assets\snipy.ico
OutputDir=dist
OutputBaseFilename=snipy-Windows-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
WizardStyle=modern

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "autostart"; Description: "Start Snipy with &Windows"; GroupDescription: "Startup:"

[Files]
Source: "target\release\snipy.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Snipy"; Filename: "{app}\snipy.exe"
Name: "{autodesktop}\Snipy"; Filename: "{app}\snipy.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Snipy"; ValueData: """{app}\snipy.exe"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\snipy.exe"; Description: "Launch Snipy"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im snipy.exe"; Flags: runhidden; RunOnceId: "KillSnipy"

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\Snipy"
