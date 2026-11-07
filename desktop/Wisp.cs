using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

class WispWindow : Form
{
    static readonly Color Bg = Color.FromArgb(25, 28, 33),
        Surface = Color.FromArgb(35, 40, 47),
        Ink = Color.FromArgb(230, 230, 225),
        Gold = Color.FromArgb(214, 185, 120);
    Label state,
        details;
    TextBox wow,
        logs;
    ListView connections,
        panels;
    CheckBox levelTips,
        weaponTips;
    NotifyIcon tray;
    System.Windows.Forms.Timer timer;
    bool polling,
        exiting,
        prefsDirty,
        settingPrefs;
    Process bridge;
    Label accountState;
    ComboBox accounts,
        models;
    string authRevision = "",
        activeAccount = "",
        configuredModel = "";
    bool authBusy,
        accountChecked;

    class Choice
    {
        public string Id,
            Title;

        public Choice(string id, string title)
        {
            Id = id;
            Title = title;
        }

        public override string ToString()
        {
            return Title;
        }
    }

    public WispWindow(bool live)
    {
        Text = "Wisp AI";
        Size = new Size(900, 650);
        MinimumSize = new Size(760, 550);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        ForeColor = Ink;
        Font = new Font("Segoe UI", 10);
        var heading = new Label
        {
            Text = "Wisp AI",
            Font = new Font("Segoe UI", 23, FontStyle.Bold),
            ForeColor = Gold,
            Location = new Point(25, 16),
            AutoSize = true,
        };
        Controls.Add(heading);
        state = new Label
        {
            Text = "Checking bridge...",
            Location = new Point(29, 65),
            AutoSize = true,
        };
        Controls.Add(state);
        var tabs = new TabControl
        {
            Location = new Point(22, 100),
            Size = new Size(835, 480),
            Anchor =
                AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
        };
        Controls.Add(tabs);
        var home = Page(tabs, "Overview");
        var mcp = Page(tabs, "MCP connections");
        var tracking = Page(tabs, "Panels");
        var automation = Page(tabs, "Suggestions");
        var account = Page(tabs, "ChatGPT");
        BuildAccountPage(account);
        BuildOverviewPage(home);
        BuildMcpPage(mcp);
        BuildPanelsPage(tracking);
        BuildSuggestionsPage(automation);
        var menu = new ContextMenuStrip();
        menu.Items.Add(
            "Open Wisp",
            null,
            delegate
            {
                Show();
                WindowState = FormWindowState.Normal;
                Activate();
            }
        );
        menu.Items.Add(
            "Exit",
            null,
            async delegate
            {
                await Guard(async () =>
                {
                    await StopBridge();
                    exiting = true;
                    tray.Visible = false;
                    Application.Exit();
                });
            }
        );
        tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Wisp AI",
            Visible = live,
            ContextMenuStrip = menu,
        };
        tray.DoubleClick += delegate
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        };
        FormClosing += delegate(object sender, FormClosingEventArgs e)
        {
            if (!exiting && live)
            {
                e.Cancel = true;
                Hide();
                tray.ShowBalloonTip(
                    2500,
                    "Wisp",
                    "Still running in the system tray.",
                    ToolTipIcon.Info
                );
            }
        };
        timer = new System.Windows.Forms.Timer { Interval = 3000 };
        timer.Tick += async delegate
        {
            await RefreshStatus();
        };
        if (live)
            Shown += async delegate
            {
                try
                {
                    await Request("GET", "/status", null);
                }
                catch
                {
                    try
                    {
                        StartBridge();
                    }
                    catch (Exception e)
                    {
                        Error(e.Message);
                    }
                }
                timer.Start();
                await RefreshStatus();
            };
    }

    void BuildAccountPage(TabPage account)
    {
        accountState = Label(account, "Start the bridge to connect your ChatGPT account.", 18, 20);
        accountState.AutoSize = false;
        accountState.Size = new Size(760, 82);
        Label(account, "Saved connections", 18, 110);
        accounts = new ComboBox
        {
            Location = new Point(18, 138),
            Width = 520,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        account.Controls.Add(accounts);
        Button(
            account,
            "Use account",
            550,
            135,
            140,
            async delegate
            {
                await AuthWork(async () =>
                {
                    var item = accounts.SelectedItem as Choice;
                    if (item != null)
                        await Request("POST", "/auth/select", new { profileId = item.Id });
                });
            }
        );
        Button(
            account,
            "Continue with ChatGPT",
            18,
            190,
            220,
            async delegate
            {
                await SignIn(false);
            }
        );
        Button(
            account,
            "Add account",
            250,
            190,
            140,
            async delegate
            {
                await SignIn(true);
            }
        );
        Button(
            account,
            "Cancel sign-in",
            402,
            190,
            145,
            async delegate
            {
                await AuthWork(async () =>
                {
                    await Request("POST", "/auth/cancel", new { });
                });
            }
        );
        Button(
            account,
            "Disconnect",
            559,
            190,
            140,
            async delegate
            {
                await AuthWork(async () =>
                {
                    await Request("POST", "/auth/disconnect", new { });
                });
            }
        );
        Label(account, "Model available on your ChatGPT plan", 18, 252);
        models = new ComboBox
        {
            Location = new Point(18, 280),
            Width = 400,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        account.Controls.Add(models);
        Button(
            account,
            "Load models",
            430,
            277,
            130,
            async delegate
            {
                await AuthWork(LoadModels);
            }
        );
        Button(
            account,
            "Use model",
            572,
            277,
            130,
            async delegate
            {
                await AuthWork(async () =>
                {
                    var item = models.SelectedItem as Choice;
                    if (item == null)
                        throw new Exception("Load and choose an available model first.");
                    await Request("POST", "/auth/model", new { model = item.Id });
                });
            }
        );
        Label(
            account,
            "Sign-in opens your browser. No API key or separate Codex installation is required.\nAccount credentials are protected by Windows for this user and this installation.\nDisconnect only affects Wisp. Your chats and memory stay on this computer.",
            18,
            340
        ).Size = new Size(760, 85);
    }

    void BuildOverviewPage(TabPage home)
    {
        Label(home, "World of Warcraft client folder", 18, 18);
        wow = Input(home, 18, 45, 625);
        wow.Text = ReadWow();
        Button(
            home,
            "Browse",
            655,
            43,
            110,
            delegate
            {
                using (var d = new FolderBrowserDialog())
                {
                    d.Description = "Select the client folder containing Wow.exe";
                    if (d.ShowDialog() == DialogResult.OK)
                        wow.Text = d.SelectedPath;
                }
            }
        );
        Button(
            home,
            "Install / update addon",
            18,
            85,
            205,
            async delegate
            {
                await Guard(async () =>
                {
                    await StopBridge();
                    var config = ReadConfig();
                    config["wow"] = wow.Text.Trim();
                    if (!File.Exists(Path.Combine(wow.Text.Trim(), "Wow.exe")))
                        throw new Exception("Choose the WoW client folder containing Wow.exe.");
                    File.WriteAllText(
                        Path.Combine(Program.Root, "config.local.json"),
                        Program.Json.Serialize(config)
                    );
                    await RunTool("scripts/install.ts", wow.Text.Trim());
                    StartBridge();
                });
            }
        );
        Button(
            home,
            "Start bridge",
            235,
            85,
            145,
            delegate
            {
                try
                {
                    StartBridge();
                }
                catch (Exception e)
                {
                    Error(e.Message);
                }
            }
        );
        Button(
            home,
            "Stop bridge",
            390,
            85,
            145,
            async delegate
            {
                await Guard(StopBridge);
            }
        );
        Button(
            home,
            "Open logs",
            545,
            85,
            145,
            delegate
            {
                Directory.CreateDirectory(Path.Combine(Program.Root, "runtime"));
                Process.Start("explorer.exe", Program.Quote(Path.Combine(Program.Root, "runtime")));
            }
        );
        details = Label(
            home,
            "Connect your account in the ChatGPT tab.\nIn WoW: /wisp, then Settings > Bind inline chat.",
            18,
            135
        );
        details.Size = new Size(760, 65);
        details.AutoSize = false;
        logs = Input(home, 18, 210, 760);
        logs.Multiline = true;
        logs.ReadOnly = true;
        logs.ScrollBars = ScrollBars.Vertical;
        logs.Height = 180;
        logs.Anchor =
            AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
    }

    void BuildMcpPage(TabPage mcp)
    {
        connections = List(
            mcp,
            new string[] { "Name", "Transport", "Tools", "Enabled" },
            new int[] { 270, 110, 85, 90 }
        );
        Button(
            mcp,
            "Add MCP",
            18,
            340,
            130,
            async delegate
            {
                await EditMcp(null);
            }
        );
        Button(
            mcp,
            "Edit",
            158,
            340,
            100,
            async delegate
            {
                if (connections.SelectedItems.Count > 0)
                    await EditMcp((Dictionary<string, object>)connections.SelectedItems[0].Tag);
            }
        );
        Button(
            mcp,
            "Test",
            268,
            340,
            100,
            async delegate
            {
                if (connections.SelectedItems.Count > 0)
                    await Guard(async () =>
                    {
                        var item = (Dictionary<string, object>)connections.SelectedItems[0].Tag;
                        var result = await Request("POST", "/mcps/test", new { server = item });
                        MessageBox.Show(
                            "Connected. Available tools: " + Program.Text(result, "count"),
                            "Wisp"
                        );
                    });
            }
        );
        Button(
            mcp,
            "Remove",
            378,
            340,
            110,
            async delegate
            {
                if (connections.SelectedItems.Count > 0)
                    await Guard(async () =>
                    {
                        var item = (Dictionary<string, object>)connections.SelectedItems[0].Tag;
                        await Request(
                            "POST",
                            "/mcps/remove",
                            new { name = Program.Text(item, "name") }
                        );
                        await RefreshStatus();
                    });
            }
        );
        Label(
            mcp,
            "HTTP / SSE endpoints and local stdio servers. Credentials are protected by Windows.\nEnable individual tools in WoW > Wisp > Tools & MCPs.",
            18,
            385
        ).Size = new Size(760, 52);
    }

    void BuildPanelsPage(TabPage tracking)
    {
        panels = List(
            tracking,
            new string[] { "Panel", "Character", "Bindings" },
            new int[] { 300, 320, 90 }
        );
        Button(
            tracking,
            "Show in WoW",
            18,
            340,
            145,
            async delegate
            {
                await PanelAction("show");
            }
        );
        Button(
            tracking,
            "Hide",
            175,
            340,
            100,
            async delegate
            {
                await PanelAction("hide");
            }
        );
        Button(
            tracking,
            "Delete",
            287,
            340,
            100,
            async delegate
            {
                await PanelAction("remove");
            }
        );
        Label(
            tracking,
            "Ask Wisp to create or edit a persistent panel.\nItem counts, money, level and quest completion update locally in WoW.",
            18,
            385
        ).Size = new Size(760, 52);
    }

    void BuildSuggestionsPage(TabPage automation)
    {
        Label(automation, "Optional suggestions", 18, 20).Font = new Font(
            "Segoe UI",
            14,
            FontStyle.Bold
        );
        levelTips = Check(automation, "When I level up", 18, 70);
        weaponTips = Check(automation, "When I equip a different weapon", 18, 110);
        Label(
            automation,
            "Suggestions are off by default. The assistant checks relevant live state before advising.\nAt most one suggestion every 10 minutes; nothing is applied automatically.\nEvents during combat or another conversation are skipped.",
            18,
            155
        ).Size = new Size(760, 90);
        Button(
            automation,
            "Save preferences",
            18,
            265,
            185,
            async delegate
            {
                await Guard(async () =>
                {
                    await Request(
                        "POST",
                        "/suggestions",
                        new { levelUp = levelTips.Checked, weapon = weaponTips.Checked }
                    );
                    prefsDirty = false;
                });
            }
        );
        levelTips.CheckedChanged += delegate
        {
            if (!settingPrefs)
                prefsDirty = true;
        };
        weaponTips.CheckedChanged += delegate
        {
            if (!settingPrefs)
                prefsDirty = true;
        };
    }

    static TabPage Page(TabControl tabs, string title)
    {
        var p = new TabPage(title) { BackColor = Bg, ForeColor = Ink };
        tabs.TabPages.Add(p);
        return p;
    }

    static Label Label(Control p, string text, int x, int y)
    {
        var l = new Label
        {
            Text = text,
            Location = new Point(x, y),
            AutoSize = true,
            ForeColor = Ink,
        };
        p.Controls.Add(l);
        return l;
    }

    static TextBox Input(Control p, int x, int y, int width)
    {
        var t = new TextBox
        {
            Location = new Point(x, y),
            Width = width,
            BackColor = Surface,
            ForeColor = Ink,
            BorderStyle = BorderStyle.FixedSingle,
        };
        p.Controls.Add(t);
        return t;
    }

    static CheckBox Check(Control p, string text, int x, int y)
    {
        var c = new CheckBox
        {
            Text = text,
            Location = new Point(x, y),
            AutoSize = true,
            ForeColor = Ink,
        };
        p.Controls.Add(c);
        return c;
    }

    static void Button(Control p, string text, int x, int y, int width, EventHandler action)
    {
        var b = new Button
        {
            Text = text,
            Location = new Point(x, y),
            Size = new Size(width, 31),
            FlatStyle = FlatStyle.Flat,
            BackColor = Surface,
            ForeColor = Ink,
        };
        b.Click += action;
        p.Controls.Add(b);
    }

    static ListView List(Control p, string[] columns, int[] widths)
    {
        var list = new ListView
        {
            Location = new Point(18, 20),
            Size = new Size(760, 300),
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            BackColor = Surface,
            ForeColor = Ink,
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
        };
        for (int i = 0; i < columns.Length; i++)
            list.Columns.Add(columns[i], widths[i]);
        p.Controls.Add(list);
        return list;
    }

    static void Error(string message)
    {
        MessageBox.Show(message, "Wisp AI", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    async Task Guard(Func<Task> work)
    {
        try
        {
            await work();
        }
        catch (Exception e)
        {
            Error(e.Message);
        }
    }

    Dictionary<string, object> ReadConfig()
    {
        try
        {
            return Program.Parse(File.ReadAllText(Path.Combine(Program.Root, "config.local.json")));
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    string ReadWow()
    {
        return Program.Text(ReadConfig(), "wow", @"E:\Blizzard\World of Warcraft\_forever_");
    }

    string Node()
    {
        var bundled = Path.Combine(Program.Root, "runtime", "node.exe");
        if (File.Exists(bundled))
            return bundled;
        var f = Path.Combine(Program.Root, "runtime-node.txt");
        if (File.Exists(f) && File.Exists(File.ReadAllText(f).Trim()))
            return File.ReadAllText(f).Trim();
        throw new Exception(
            "The bundled runtime is missing. Extract the complete Wisp release ZIP."
        );
    }

    ProcessStartInfo ProcessInfo(string script, string extra = "")
    {
        var p = new ProcessStartInfo(
            Node(),
            Program.Quote(Path.Combine(Program.Root, script))
                + (extra.Length > 0 ? " " + Program.Quote(extra) : "")
        )
        {
            WorkingDirectory = Program.Root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        p.EnvironmentVariables["PATH"] =
            Path.GetDirectoryName(Node()) + ";" + Environment.GetEnvironmentVariable("PATH");
        p.EnvironmentVariables["DO_NOT_TRACK"] = "1";
        return p;
    }

    void StartBridge()
    {
        if (bridge != null && !bridge.HasExited)
            return;
        if (!File.Exists(Path.Combine(Program.Root, "config.local.json")))
            throw new Exception("Choose your WoW client folder and click Install / update addon.");
        Directory.CreateDirectory(Path.Combine(Program.Root, "runtime"));
        bridge = new Process { StartInfo = ProcessInfo("src/main.ts"), EnableRaisingEvents = true };
        bridge.OutputDataReceived += Log;
        bridge.ErrorDataReceived += Log;
        bridge.Start();
        bridge.BeginOutputReadLine();
        bridge.BeginErrorReadLine();
        state.Text = "Starting bridge...";
    }

    void Log(object sender, DataReceivedEventArgs e)
    {
        if (e.Data == null || !IsHandleCreated)
            return;
        BeginInvoke(
            (Action)
                delegate
                {
                    if (logs.TextLength > 20000)
                        logs.Clear();
                    logs.AppendText(e.Data + Environment.NewLine);
                }
        );
    }

    async Task RunTool(string script, string arg)
    {
        using (var p = new Process { StartInfo = ProcessInfo(script, arg) })
        {
            p.Start();
            var output = p.StandardOutput.ReadToEndAsync();
            var errors = p.StandardError.ReadToEndAsync();
            await Task.Run(() => p.WaitForExit());
            string result = await output;
            string error = await errors;
            logs.AppendText(result);
            if (p.ExitCode != 0)
                throw new Exception(error.Length > 0 ? error : "Addon installation failed.");
        }
    }

    async Task StopBridge()
    {
        bool stopped = false;
        try
        {
            await Request("POST", "/stop", new { });
            stopped = true;
        }
        catch (Exception e)
        {
            if (
                e.Message != "The Wisp bridge is not responding."
                && e.Message != "Start the Wisp bridge first."
            )
                throw;
        }
        if (!stopped && bridge != null && !bridge.HasExited)
        {
            var info = new ProcessStartInfo("taskkill.exe", "/PID " + bridge.Id + " /T /F")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
            };
            using (var killer = Process.Start(info))
                await Task.Run(() => killer.WaitForExit());
        }
        if (stopped)
        {
            int pid;
            try
            {
                var identity = Program.Parse(
                    File.ReadAllText(Path.Combine(Program.Root, "runtime", "desktop.json"))
                );
                pid = Convert.ToInt32(identity["pid"]);
                using (var process = Process.GetProcessById(pid))
                    await Task.Run(() => process.WaitForExit(15000));
            }
            catch (ArgumentException) { }
        }
        state.Text = "Bridge stopped";
    }

    async Task<Dictionary<string, object>> Request(string method, string route, object body)
    {
        Dictionary<string, object> identity;
        try
        {
            identity = Program.Parse(
                File.ReadAllText(Path.Combine(Program.Root, "runtime", "desktop.json"))
            );
        }
        catch
        {
            throw new Exception("Start the Wisp bridge first.");
        }
        using (var web = new WebClient())
        {
            web.Encoding = Encoding.UTF8;
            web.Headers["Authorization"] = "Bearer " + Program.Text(identity, "token");
            web.Headers["Content-Type"] = "application/json";
            try
            {
                string raw =
                    method == "GET"
                        ? await web.DownloadStringTaskAsync(
                            "http://127.0.0.1:" + Program.Text(identity, "port") + route
                        )
                        : await web.UploadStringTaskAsync(
                            "http://127.0.0.1:" + Program.Text(identity, "port") + route,
                            method,
                            Program.Json.Serialize(body)
                        );
                return Program.Parse(raw);
            }
            catch (WebException e)
            {
                if (e.Response != null)
                {
                    using (var reader = new StreamReader(e.Response.GetResponseStream()))
                    {
                        var raw = reader.ReadToEnd();
                        try
                        {
                            throw new Exception(
                                Program.Text(Program.Parse(raw), "error", "Request failed.")
                            );
                        }
                        catch (ArgumentException)
                        {
                            throw new Exception("Request failed.");
                        }
                    }
                }
                throw new Exception("The Wisp bridge is not responding.");
            }
        }
    }

    static IEnumerable<Dictionary<string, object>> Objects(
        Dictionary<string, object> data,
        string key
    )
    {
        object value;
        if (!data.TryGetValue(key, out value) || !(value is IEnumerable))
            yield break;
        foreach (var item in (IEnumerable)value)
        {
            var row = item as Dictionary<string, object>;
            if (row != null)
                yield return row;
        }
    }

    async Task AuthWork(Func<Task> work)
    {
        if (authBusy)
            return;
        authBusy = true;
        try
        {
            await Guard(work);
        }
        finally
        {
            authBusy = false;
        }
        await RefreshStatus();
    }

    async Task SignIn(bool add)
    {
        await AuthWork(async () =>
        {
            var selected = accounts.SelectedItem as Choice;
            var data = await Request(
                "POST",
                "/auth/start",
                new { profileId = add || selected == null ? null : selected.Id, newAccount = add }
            );
            Uri url;
            if (
                !Uri.TryCreate(Program.Text(data, "authorizationUrl"), UriKind.Absolute, out url)
                || url.Scheme != "https"
                || url.Host != "auth.openai.com"
                || !url.IsDefaultPort
                || url.UserInfo.Length > 0
            )
                throw new Exception("Unexpected ChatGPT sign-in address.");
            Process.Start(url.AbsoluteUri);
        });
    }

    async Task LoadModels()
    {
        var result = await Request("GET", "/auth/models", null);
        models.Items.Clear();
        foreach (var row in Objects(result, "models"))
        {
            var item = new Choice(Program.Text(row, "slug"), Program.Text(row, "displayName"));
            models.Items.Add(item);
            if (item.Id == configuredModel)
                models.SelectedItem = item;
        }
        if (models.SelectedIndex < 0 && models.Items.Count > 0)
            models.SelectedIndex = 0;
    }

    void UpdateAccount(Dictionary<string, object> data)
    {
        object raw;
        if (!data.TryGetValue("auth", out raw))
            return;
        var auth = raw as Dictionary<string, object>;
        if (auth == null)
            return;
        var status = Program.Text(auth, "status");
        string label =
            status == "connected" ? "Connected to ChatGPT"
            : status == "authorizing" ? "Waiting for browser sign-in"
            : status == "reauth_required" ? "Session expired - continue with ChatGPT"
            : status == "plan_permission_required" ? "Account connected - plan permission required"
            : status == "disconnecting" ? "Disconnecting..."
            : "Not connected - continue with ChatGPT";
        accountState.Text =
            label + "\n" + Program.Text(auth, "account") + "\n" + Program.Text(auth, "message");
        if (!accountChecked)
        {
            accountChecked = true;
            if (status != "connected")
                ((TabControl)accountState.Parent.Parent).SelectedTab = (TabPage)accountState.Parent;
        }
        if (status != "connected")
            state.Text = "Bridge running - " + label;
        configuredModel = Program.Text(data, "model");
        var revision = Program.Text(auth, "revision");
        var active = Program.Text(auth, "activeId");
        if (active != activeAccount)
        {
            activeAccount = active;
            models.Items.Clear();
        }
        if (revision != authRevision)
        {
            authRevision = revision;
            var selected = accounts.SelectedItem as Choice;
            string id = selected == null ? active : selected.Id;
            accounts.Items.Clear();
            foreach (var row in Objects(auth, "profiles"))
            {
                var item = new Choice(Program.Text(row, "id"), Program.Text(row, "label"));
                accounts.Items.Add(item);
                if (item.Id == id)
                    accounts.SelectedItem = item;
            }
            if (accounts.SelectedIndex < 0 && accounts.Items.Count > 0)
                accounts.SelectedIndex = 0;
        }
    }

    async Task RefreshStatus()
    {
        if (polling)
            return;
        polling = true;
        try
        {
            var data = await Request("GET", "/status", null);
            state.Text =
                Program.Text(data, "ready") != "True" ? "Bridge running - agent starting"
                : Program.Text(data, "gameConnected") == "True" ? "Connected to WoW"
                : "Agent ready - waiting for WoW";
            state.ForeColor = Gold;
            UpdateAccount(data);
            string selected =
                connections.SelectedItems.Count > 0 ? connections.SelectedItems[0].Text : "";
            connections.BeginUpdate();
            connections.Items.Clear();
            foreach (var row in Objects(data, "mcps"))
            {
                object tools;
                int count =
                    row.TryGetValue("tools", out tools) && tools is object[]
                        ? ((object[])tools).Length
                        : 0;
                var item = new ListViewItem(
                    new[]
                    {
                        Program.Text(row, "name"),
                        Program.Text(row, "transport"),
                        count.ToString(),
                        Program.Text(row, "enabled"),
                    }
                )
                {
                    Tag = row,
                };
                connections.Items.Add(item);
                if (item.Text == selected)
                    item.Selected = true;
            }
            connections.EndUpdate();
            string panelId =
                panels.SelectedItems.Count > 0
                    ? Program.Text((Dictionary<string, object>)panels.SelectedItems[0].Tag, "id")
                    : "";
            panels.BeginUpdate();
            panels.Items.Clear();
            foreach (var row in Objects(data, "panels"))
            {
                object bindings;
                int count =
                    row.TryGetValue("bindings", out bindings) && bindings is object[]
                        ? ((object[])bindings).Length
                        : 0;
                var item = new ListViewItem(
                    new[]
                    {
                        Program.Text(row, "title"),
                        Program.Text(row, "character"),
                        count.ToString(),
                    }
                )
                {
                    Tag = row,
                };
                panels.Items.Add(item);
                if (Program.Text(row, "id") == panelId)
                    item.Selected = true;
            }
            panels.EndUpdate();
            object prefs;
            if (!prefsDirty && data.TryGetValue("suggestions", out prefs))
            {
                var p = prefs as Dictionary<string, object>;
                settingPrefs = true;
                levelTips.Checked = Program.Text(p, "levelUp") == "True";
                weaponTips.Checked = Program.Text(p, "weapon") == "True";
                settingPrefs = false;
            }
        }
        catch
        {
            state.Text = "Bridge stopped";
            state.ForeColor = Ink;
        }
        finally
        {
            polling = false;
        }
    }

    async Task EditMcp(Dictionary<string, object> existing)
    {
        using (var dialog = new McpDialog(existing, Request))
        {
            if (dialog.ShowDialog(this) == DialogResult.OK)
                await RefreshStatus();
        }
    }

    async Task PanelAction(string action)
    {
        if (panels.SelectedItems.Count == 0)
            return;
        await Guard(async () =>
        {
            var row = (Dictionary<string, object>)panels.SelectedItems[0].Tag;
            await Request(
                "POST",
                "/panels/action",
                new
                {
                    action = action,
                    id = Program.Text(row, "id"),
                    characterKey = Program.Text(row, "characterKey"),
                }
            );
            await RefreshStatus();
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (timer != null)
                timer.Dispose();
            if (tray != null)
                tray.Dispose();
        }
        base.Dispose(disposing);
    }

    class McpDialog : Form
    {
        TextBox name,
            description,
            address,
            args,
            env,
            token;
        ComboBox transport;
        CheckBox enabled,
            clearToken;
        Label status;
        Func<string, string, object, Task<Dictionary<string, object>>> request;
        Dictionary<string, object> existing;

        public McpDialog(
            Dictionary<string, object> old,
            Func<string, string, object, Task<Dictionary<string, object>>> call
        )
        {
            existing = old;
            request = call;
            Text = old == null ? "Add MCP connection" : "Edit MCP connection";
            Size = new Size(620, 610);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            BackColor = Bg;
            ForeColor = Ink;
            Font = new Font("Segoe UI", 10);
            Label(this, "Name (lowercase identifier)", 18, 15);
            name = Input(this, 18, 40, 560);
            name.Text = Program.Text(old, "name");
            name.Enabled = old == null;
            Label(this, "Description", 18, 75);
            description = Input(this, 18, 100, 560);
            description.Text = Program.Text(old, "description");
            Label(this, "Transport", 18, 135);
            transport = new ComboBox
            {
                Location = new Point(18, 160),
                Width = 180,
                DropDownStyle = ComboBoxStyle.DropDownList,
            };
            transport.Items.AddRange(new object[] { "http", "sse", "stdio" });
            transport.SelectedItem = Program.Text(old, "transport", "http");
            Controls.Add(transport);
            enabled = Check(this, "Enabled", 235, 163);
            enabled.Checked = old == null || Program.Text(old, "enabled") == "True";
            Label(this, "URL (HTTP / SSE) or executable (stdio)", 18, 200);
            address = Input(this, 18, 225, 560);
            address.Text = Program.Text(
                old,
                Program.Text(old, "transport") == "stdio" ? "command" : "url"
            );
            Label(this, "Arguments as JSON array (stdio)", 18, 260);
            args = Input(this, 18, 285, 560);
            object previous;
            args.Text =
                old != null && old.TryGetValue("args", out previous)
                    ? Program.Json.Serialize(previous)
                    : "[]";
            Label(this, "Environment as JSON object (stdio; blank keeps stored values)", 18, 320);
            env = Input(this, 18, 345, 560);
            Label(this, "Bearer token (blank keeps stored token)", 18, 380);
            token = Input(this, 18, 405, 420);
            token.UseSystemPasswordChar = true;
            clearToken = Check(this, "Clear token", 450, 408);
            status = Label(
                this,
                "Test the connection before saving. Local commands run on your computer.",
                18,
                448
            );
            status.AutoSize = false;
            status.Size = new Size(560, 45);
            Button(
                this,
                "Test connection",
                18,
                505,
                170,
                async delegate
                {
                    await Submit(false);
                }
            );
            Button(
                this,
                "Save",
                200,
                505,
                115,
                async delegate
                {
                    await Submit(true);
                }
            );
            Button(
                this,
                "Cancel",
                327,
                505,
                115,
                delegate
                {
                    Close();
                }
            );
        }

        object Payload()
        {
            var server = new Dictionary<string, object>
            {
                { "name", name.Text.Trim() },
                { "description", description.Text.Trim() },
                { "transport", transport.Text },
                { "enabled", enabled.Checked },
                { "args", Program.Json.Deserialize<object[]>(args.Text) },
            };
            server[transport.Text == "stdio" ? "command" : "url"] = address.Text.Trim();
            var data = new Dictionary<string, object> { { "server", server } };
            if (clearToken.Checked || token.Text.Length > 0)
                data["token"] = clearToken.Checked ? "" : token.Text;
            if (env.Text.Trim().Length > 0)
                data["env"] = Program.Json.Deserialize<Dictionary<string, string>>(env.Text);
            return data;
        }

        async Task Submit(bool save)
        {
            try
            {
                status.Text = save ? "Testing and saving..." : "Testing...";
                Enabled = false;
                var result = await request("POST", save ? "/mcps/save" : "/mcps/test", Payload());
                status.Text = "Connected. Available tools: " + Program.Text(result, "count");
                if (save)
                {
                    DialogResult = DialogResult.OK;
                    Close();
                }
            }
            catch (Exception e)
            {
                status.Text = e.Message;
            }
            finally
            {
                Enabled = true;
            }
        }
    }
}
