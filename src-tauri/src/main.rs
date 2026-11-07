#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod vault;
use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct Host { data: PathBuf, payload: PathBuf, child: Mutex<Option<Child>> }

fn hidden(command: &mut Command) {
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    #[cfg(not(windows))] let _ = command;
}

impl Host {
    fn node(&self) -> PathBuf { self.payload.join("runtime").join(if cfg!(windows) { "node.exe" } else { "node" }) }
    fn command(&self, script: &str) -> Result<Command, String> {
        let mut command = Command::new(self.node());
        command.arg(self.payload.join(script)).current_dir(&self.payload)
            .env("WISP_DATA_DIR", &self.data)
            .env("WISP_DESKTOP_EXE", std::env::current_exe().map_err(|e| e.to_string())?)
            .env("DO_NOT_TRACK", "1");
        hidden(&mut command);
        Ok(command)
    }
    async fn request(&self, method: &str, route: &str, body: Value) -> Result<Value, String> {
        let raw = fs::read(self.data.join("runtime/desktop.json")).map_err(|_| "Start Wisp first.")?;
        let identity: Value = serde_json::from_slice(&raw).map_err(|_| "Invalid bridge identity.")?;
        let port = identity["port"].as_u64().filter(|p| *p > 0 && *p < 65536).ok_or("Invalid bridge port.")?;
        let token = identity["token"].as_str().ok_or("Invalid bridge identity.")?;
        let client = reqwest::Client::builder().timeout(Duration::from_secs(if route == "/mcps/test" { 90 } else { 40 })).redirect(reqwest::redirect::Policy::none()).build().map_err(|e| e.to_string())?;
        let request = client.request(if method == "GET" {reqwest::Method::GET} else {reqwest::Method::POST}, format!("http://127.0.0.1:{port}{route}"))
            .bearer_auth(token);
        let response = if method == "GET" {request} else {request.json(&body)}.send().await.map_err(|_| "The Wisp bridge is not responding.")?;
        let ok = response.status().is_success();
        let value: Value = response.json().await.map_err(|_| "Unexpected bridge response.")?;
        if !ok { return Err(value["error"].as_str().unwrap_or("The operation failed.").to_string()); }
        Ok(value)
    }
}

fn permitted(method: &str, route: &str) -> bool {
    (method == "GET" && ["/status", "/auth/models"].contains(&route)) ||
    (method == "POST" && ["/auth/start", "/auth/cancel", "/auth/select", "/auth/disconnect", "/auth/model", "/mcps/test", "/mcps/save", "/mcps/remove", "/panels/action", "/suggestions", "/simulator/character"].contains(&route))
}

#[tauri::command]
async fn bridge_request(host: tauri::State<'_, Host>, method: String, route: String, body: Option<Value>) -> Result<Value, String> {
    if !permitted(&method, &route) { return Err("Unsupported desktop operation.".into()); }
    let body = body.unwrap_or(json!({}));
    if body.to_string().len() > 100000 { return Err("Request is too large.".into()); }
    host.request(&method, &route, body).await
}

#[tauri::command]
fn desktop_info(host: tauri::State<'_, Host>) -> Value {
    let config = fs::read(host.data.join("config.local.json")).ok().and_then(|s| serde_json::from_slice::<Value>(&s).ok()).unwrap_or(json!({}));
    json!({"wow":config["wow"], "configured":config["wow"].as_str().is_some(), "dataDirectory":host.data.to_string_lossy(), "platform": std::env::consts::OS, "version": env!("CARGO_PKG_VERSION")})
}

#[tauri::command]
async fn start_bridge(host: tauri::State<'_, Host>) -> Result<(), String> {
    if host.request("GET", "/status", json!({})).await.is_ok() { return Ok(()); }
    if !host.data.join("config.local.json").is_file() { return Err("Choose your WoW folder and install the addon first.".into()); }
    let mut child = host.child.lock().map_err(|_| "Application state is unavailable.")?;
    if let Some(process) = child.as_mut() { if process.try_wait().map_err(|e| e.to_string())?.is_none() { return Ok(()); } }
    let log = fs::OpenOptions::new().create(true).append(true).open(host.data.join("runtime/bridge.log")).map_err(|e| e.to_string())?;
    let mut command = host.command("src/main.ts")?;
    command.stdin(Stdio::null()).stdout(log.try_clone().map_err(|e|e.to_string())?).stderr(log);
    *child = Some(command.spawn().map_err(|e|format!("Cannot start Wisp: {e}"))?);
    Ok(())
}

async fn stop_host(host: &Host) -> Result<(), String> {
    match host.request("POST", "/stop", json!({})).await {
        Ok(_) => {
            for _ in 0..50 {
                if host.request("GET", "/status", json!({})).await.is_err() { break; }
                tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(100))).await.map_err(|e|e.to_string())?;
            }
            Ok(())
        }
        Err(error) if error == "Start Wisp first." || error == "The Wisp bridge is not responding." => Ok(()),
        Err(error) => Err(error)
    }
}

#[tauri::command]
async fn stop_bridge(host: tauri::State<'_, Host>) -> Result<(), String> { stop_host(&host).await }

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_title("Choose a folder").blocking_pick_folder().map(|p|p.to_string())).await.map_err(|e|e.to_string())
}

#[tauri::command]
async fn install_addon(host: tauri::State<'_, Host>, wow: String) -> Result<String, String> {
    if !Path::new(&wow).join("Wow.exe").is_file() && !Path::new(&wow).join("World of Warcraft.app").exists() {
        return Err("Choose the WoW client folder containing Wow.exe or World of Warcraft.app.".into());
    }
    stop_host(&host).await?;
    let mut command = host.command("scripts/install.ts")?;
    command.arg(wow).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let output = tauri::async_runtime::spawn_blocking(move || command.output()).await.map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).chars().take(1000).collect()); }
    Ok("Addon installed. Restart WoW after first installation; use /reload for updates.".into())
}

#[tauri::command]
fn open_sign_in(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid sign-in address.")?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("auth.openai.com") || parsed.port().is_some() || !parsed.username().is_empty() || parsed.password().is_some() { return Err("Unexpected sign-in address.".into()); }
    app.opener().open_url(url, None::<&str>).map_err(|e|e.to_string())
}

#[tauri::command]
fn open_logs(app: tauri::AppHandle, host: tauri::State<'_, Host>) -> Result<(), String> {
    app.opener().open_path(host.data.join("runtime").to_string_lossy(), None::<&str>).map_err(|e|e.to_string())
}

#[tauri::command]
fn read_logs(host: tauri::State<'_, Host>) -> String {
    use std::io::{Read, Seek, SeekFrom};
    let mut output = String::new();
    for name in ["bridge.log", "eve.log"] {
        if let Ok(mut file) = fs::File::open(host.data.join("runtime").join(name)) {
            let len = file.metadata().map(|m|m.len()).unwrap_or(0);
            let _ = file.seek(SeekFrom::Start(len.saturating_sub(12000)));
            let mut bytes = Vec::new(); let _ = file.read_to_end(&mut bytes);
            output.push_str(&format!("--- {name} ---\n{}\n", String::from_utf8_lossy(&bytes)));
        }
    }
    output
}

#[tauri::command]
async fn import_legacy(host: tauri::State<'_, Host>, source: String) -> Result<String, String> {
    if host.data.join("config.local.json").exists() { return Err("Import is available before configuring this installation, to avoid overwriting your data.".into()); }
    let mut command = host.command("scripts/migrate-desktop.ts")?;
    command.arg(source).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let output = tauri::async_runtime::spawn_blocking(move ||command.output()).await.map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).chars().take(1000).collect()); }
    Ok("Imported your previous Wisp data. You can start Wisp now.".into())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--secret") {
        if let Err(error) = vault::run(&args) { eprintln!("{error}"); std::process::exit(1); }
        return;
    }
    if args.get(1).map(String::as_str) == Some("--self-test") {
        let result = (|| -> Result<(), String> {
            let payload = std::env::var_os("WISP_PAYLOAD_ROOT").map(PathBuf::from).unwrap_or(std::env::current_exe().map_err(|e|e.to_string())?.parent().ok_or("Missing executable directory")?.join("payload"));
            for name in ["src/main.ts", "agent/agent.ts", "scripts/install.ts", "addon/WispAI/WispAI.toc", "node_modules/eve/bin/eve.js"] { if !payload.join(name).is_file() {return Err(format!("Missing resource: {name}"));} }
            let mut command = Command::new(payload.join("runtime").join(if cfg!(windows) {"node.exe"} else {"node"})); hidden(&mut command);
            if !command.arg("--version").output().map_err(|e|e.to_string())?.status.success() {return Err("Bundled Node did not start".into());}
            vault::self_test()
        })();
        if let Err(error)=result {eprintln!("{error}");std::process::exit(1);}
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| { if let Some(window) = app.get_webview_window("main") { let _=window.show(); let _=window.set_focus(); } }))
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![bridge_request, desktop_info, start_bridge, stop_bridge, pick_folder, install_addon, open_sign_in, open_logs, read_logs, import_legacy])
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(data.join("runtime"))?;
            let payload = std::env::var_os("WISP_PAYLOAD_ROOT").map(PathBuf::from).unwrap_or(app.path().resource_dir()?.join("payload"));
            app.manage(Host {data, payload, child: Mutex::new(None)});
            let show = tauri::menu::MenuItem::with_id(app, "show", "Open Wisp", true, None::<&str>)?;
            let exit = tauri::menu::MenuItem::with_id(app, "exit", "Exit Wisp", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &exit])?;
            tauri::tray::TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone()).tooltip("Wisp AI").menu(&menu)
                .on_menu_event(|app,event| { if event.id.as_ref() == "show" { if let Some(window)=app.get_webview_window("main") {let _=window.show();let _=window.set_focus();} }
                else if event.id.as_ref() == "exit" { let app=app.clone();tauri::async_runtime::spawn(async move { let host=app.state::<Host>(); match stop_host(&host).await {Ok(())=>app.exit(0),Err(error)=>{if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}let _=app.emit("desktop-error",error);}} }); } })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window,event| { if let tauri::WindowEvent::CloseRequested {api,..}=event {api.prevent_close();let _=window.hide();} })
        .run(tauri::generate_context!()).expect("Wisp could not start");
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn desktop_routes_are_explicit() { assert!(permitted("GET","/status"));assert!(permitted("POST","/mcps/save"));assert!(!permitted("GET","http://example.com"));assert!(!permitted("POST","/model/responses"));assert!(!permitted("POST","/status")); }
}
