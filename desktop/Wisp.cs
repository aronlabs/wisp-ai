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

partial class WispWindow : Form
{
    static readonly Color Bg = Color.FromArgb(20, 25, 29),
        Surface = Color.FromArgb(28, 35, 40),
        Ink = Color.FromArgb(228, 235, 233),
        Gold = Color.FromArgb(119, 219, 198);
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
        BuildShell();
        var home = Page("Overview");
        var account = Page("Connections");
        var mcp = Page("Tools & MCPs");
        var tracking = Page("Panels");
        var automation = Page("Suggestions");
        var diagnostics = Page("Diagnostics");
        BuildAccountPage(account);
        BuildOverviewPage(home);
        BuildMcpPage(mcp);
        BuildPanelsPage(tracking);
        BuildSuggestionsPage(automation);
        BuildDiagnosticsPage(diagnostics);
        connections.DoubleClick += async delegate
        {
            if (connections.SelectedItems.Count > 0)
                await EditMcp((Dictionary<string, object>)connections.SelectedItems[0].Tag);
        };
        BindSelectionActions(mcp, connections, "Add MCP");
        BindSelectionActions(tracking, panels, "");
        ShowPage("Overview");
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
            Icon = Icon,
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

    void BuildAccountPage(Panel page)
    {
        var account = Card(
            page,
            "ChatGPT",
            "Connect with your subscription. No API key needed.",
            18,
            8,
            756,
            470
        );
        accountState = Label(account, "Start Wisp to manage this connection.", 20, 85);
        accountState.AutoSize = false;
        accountState.Size = new Size(708, 66);
        Label(account, "Saved accounts", 20, 165);
        accounts = new ComboBox
        {
            Location = new Point(20, 192),
            Width = 500,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        account.Controls.Add(accounts);
        StyleCombo(accounts);
        Button(
            account,
            "Use account",
            540,
            190,
            176,
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
            20,
            243,
            208,
            async delegate
            {
                await SignIn(false);
            }
        );
        Button(
            account,
            "Add account",
            244,
            243,
            130,
            async delegate
            {
                await SignIn(true);
            }
        );
        Button(
            account,
            "Cancel sign-in",
            390,
            243,
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
            551,
            243,
            165,
            async delegate
            {
                await AuthWork(async () =>
                {
                    await Request("POST", "/auth/disconnect", new { });
                });
            }
        );
        Label(account, "Default model for new chats", 20, 302);
        models = new ComboBox
        {
            Location = new Point(20, 330),
            Width = 408,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };
        account.Controls.Add(models);
        StyleCombo(models);
        Button(
            account,
            "Refresh models",
            444,
            328,
            124,
            async delegate
            {
                await AuthWork(LoadModels);
            }
        );
        Button(
            account,
            "Set default",
            584,
            328,
            132,
            async delegate
            {
                await AuthWork(async () =>
                {
                    var item = models.SelectedItem as Choice;
                    if (item == null)
                        throw new Exception("Choose an available model first.");
                    await Request("POST", "/auth/model", new { model = item.Id });
                });
            }
        );
        var note = Label(
            account,
            "You can choose a different model and effort inside each chat.\nCredentials are protected by Windows. Disconnecting keeps your chats and memory.",
            20,
            396
        );
        note.ForeColor = Color.FromArgb(145, 161, 167);
        note.Font = new Font("Segoe UI", 9);
    }

    void BuildOverviewPage(Panel home)
    {
        var game = Card(home, "WORLD OF WARCRAFT", "", 18, 10, 244, 104);
        gameValue = Label(game, "Waiting for WoW", 20, 53);
        gameValue.Font = new Font("Segoe UI", 15, FontStyle.Bold);
        var account = Card(home, "AI CONNECTION", "", 274, 10, 244, 104);
        accountValue = Label(account, "Checking account...", 20, 53);
        accountValue.Font = new Font("Segoe UI", 15, FontStyle.Bold);
        var agent = Card(home, "WISP", "", 530, 10, 244, 104);
        agentValue = Label(agent, "Checking...", 20, 53);
        agentValue.Font = new Font("Segoe UI", 15, FontStyle.Bold);
        var installation = Card(home, "Game installation", "", 18, 130, 756, 160);
        wow = Input(installation, 20, 55, 580);
        wow.Text = ReadWow();
        Button(
            installation,
            "Choose folder",
            614,
            52,
            122,
            delegate
            {
                using (var dialog = new FolderBrowserDialog())
                {
                    dialog.Description = "Select the client folder containing Wow.exe";
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                        wow.Text = dialog.SelectedPath;
                }
            }
        );
        Button(
            installation,
            "Install / update addon",
            20,
            106,
            192,
            async delegate
            {
                await Guard(async () =>
                {
                    if (!File.Exists(Path.Combine(wow.Text.Trim(), "Wow.exe")))
                        throw new Exception("Choose the WoW client folder containing Wow.exe.");
                    await StopBridge();
                    var config = ReadConfig();
                    config["wow"] = wow.Text.Trim();
                    File.WriteAllText(
                        Path.Combine(Program.Root, "config.local.json"),
                        Program.Json.Serialize(config)
                    );
                    await RunTool("scripts/install.ts", wow.Text.Trim());
                    StartBridge();
                    Notice("Addon installed. Restart WoW after the first installation.", false);
                });
            }
        );
        startControl = Button(
            installation,
            "Start Wisp",
            228,
            106,
            130,
            async delegate
            {
                await Guard(() =>
                {
                    StartBridge();
                    return Task.FromResult(0);
                });
            }
        );
        stopControl = Button(
            installation,
            "Stop Wisp",
            374,
            106,
            130,
            async delegate
            {
                await Guard(StopBridge);
            }
        );
        Button(
            installation,
            "Diagnostics",
            520,
            106,
            130,
            delegate
            {
                ShowPage("Diagnostics");
            }
        );
        var next = Card(home, "Back to Azeroth", "", 18, 306, 756, 164);
        details = Label(next, "Connect an AI provider, then open /wisp in game.", 20, 50);
        details.AutoSize = false;
        details.Size = new Size(706, 45);
        details.ForeColor = Color.FromArgb(159, 176, 180);
        Button(
            next,
            "Manage connections",
            20,
            111,
            190,
            delegate
            {
                ShowPage("Connections");
            }
        );
        Button(
            next,
            "Tools & MCPs",
            226,
            111,
            190,
            delegate
            {
                ShowPage("Tools & MCPs");
            }
        );
    }

    void BuildDiagnosticsPage(Panel page)
    {
        Label(page, "Local bridge activity", 18, 15);
        logs = Input(page, 18, 48, 756);
        logs.Multiline = true;
        logs.ReadOnly = true;
        logs.ScrollBars = ScrollBars.Vertical;
        logs.Height = 340;
        logs.Font = new Font("Consolas", 9);
        logs.Anchor =
            AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        Button(
            page,
            "Open logs folder",
            18,
            408,
            180,
            delegate
            {
                Directory.CreateDirectory(Path.Combine(Program.Root, "runtime"));
                Process.Start("explorer.exe", Program.Quote(Path.Combine(Program.Root, "runtime")));
            }
        );
        Label(page, "Logs stay on your computer. Review them before sharing.", 18, 458).ForeColor =
            Color.FromArgb(145, 161, 167);
    }

    void BuildMcpPage(Panel mcp)
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
                        Notice(
                            "Connected. Available tools: " + Program.Text(result, "count"),
                            false
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

    void BuildPanelsPage(Panel tracking)
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

    void BuildSuggestionsPage(Panel page)
    {
        var level = Card(
            page,
            "A little direction when you level up",
            "Wisp can check what changed and suggest a useful next step.",
            18,
            10,
            756,
            122
        );
        levelTips = Check(level, "Offer level-up suggestions", 20, 86);
        var weapon = Card(
            page,
            "Get to know your new weapon",
            "Receive a contextual tip when you equip a different weapon.",
            18,
            148,
            756,
            122
        );
        weaponTips = Check(weapon, "Offer weapon suggestions", 20, 86);
        var note = Label(
            page,
            "Suggestions are optional and off by default. At most one every ten minutes.\nEvents during combat or another turn are skipped. Wisp never applies changes automatically.",
            20,
            300
        );
        note.ForeColor = Color.FromArgb(145, 161, 167);
        note.Font = new Font("Segoe UI", 9);
        Button save = null;
        save = Button(
            page,
            "Save preferences",
            18,
            374,
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
                    save.Enabled = false;
                    Notice("Suggestion preferences saved.", false);
                });
            }
        );
        save.Enabled = false;
        EventHandler changed = delegate
        {
            if (!settingPrefs)
            {
                prefsDirty = true;
                save.Enabled = true;
            }
        };
        levelTips.CheckedChanged += changed;
        weaponTips.CheckedChanged += changed;
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

    static Button Button(Control p, string text, int x, int y, int width, EventHandler action)
    {
        var b = new WispButton
        {
            Primary =
                text == "Continue with ChatGPT"
                || text == "Install / update addon"
                || text == "Add MCP",
            Text = text,
            Location = new Point(x, y),
            Size = new Size(width, 31),
            FlatStyle = FlatStyle.Flat,
            BackColor = Surface,
            ForeColor = Ink,
        };
        b.Click += action;
        p.Controls.Add(b);
        return b;
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
            BorderStyle = BorderStyle.None,
            OwnerDraw = true,
            BackColor = Surface,
            ForeColor = Ink,
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
        };
        list.DrawColumnHeader += delegate(object sender, DrawListViewColumnHeaderEventArgs e)
        {
            using (var brush = new SolidBrush(Color.FromArgb(36, 46, 51)))
                e.Graphics.FillRectangle(brush, e.Bounds);
            TextRenderer.DrawText(
                e.Graphics,
                e.Header.Text,
                list.Font,
                e.Bounds,
                Color.FromArgb(145, 161, 167),
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left
            );
        };
        list.DrawItem += delegate(object sender, DrawListViewItemEventArgs e) { };
        list.DrawSubItem += delegate(object sender, DrawListViewSubItemEventArgs e)
        {
            using (
                var brush = new SolidBrush(e.Item.Selected ? Color.FromArgb(41, 67, 66) : Surface)
            )
                e.Graphics.FillRectangle(brush, e.Bounds);
            var bounds = e.Bounds;
            bounds.Inflate(-7, 0);
            TextRenderer.DrawText(
                e.Graphics,
                e.SubItem.Text,
                list.Font,
                bounds,
                Ink,
                TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis
            );
        };
        for (int i = 0; i < columns.Length; i++)
            list.Columns.Add(columns[i], widths[i]);
        Action stretch = delegate
        {
            int used = 0;
            for (int i = 0; i < list.Columns.Count - 1; i++)
                used += list.Columns[i].Width;
            list.Columns[list.Columns.Count - 1].Width = Math.Max(80, list.ClientSize.Width - used);
        };
        list.SizeChanged += delegate
        {
            stretch();
        };
        stretch();
        p.Controls.Add(list);
        return list;
    }

    static void Error(string message)
    {
        MessageBox.Show(message, "Wisp AI", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    async Task Guard(Func<Task> work)
    {
        if (operationBusy)
            return;
        operationBusy = true;
        UseWaitCursor = true;
        Notice("Working...", false);
        try
        {
            await work();
            if (feedback.Text == "Working...")
                Notice("Done.", false);
        }
        catch (Exception e)
        {
            Notice(e.Message, true);
        }
        finally
        {
            operationBusy = false;
            UseWaitCursor = false;
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
        return Program.Text(ReadConfig(), "wow", "");
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
                ShowPage("Connections");
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

    string mcpView = "",
        panelView = "";

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
            UpdateDashboard(data);
            var provider = data["auth"] as Dictionary<string, object>;
            if (
                provider != null
                && Program.Text(provider, "status") == "connected"
                && activeAccount != automaticModelsAccount
                && Program.Text(data, "activeTurns") == "0"
            )
            {
                automaticModelsAccount = activeAccount;
                try
                {
                    await LoadModels();
                }
                catch (Exception e)
                {
                    Notice(e.Message, true);
                }
            }
            string selected =
                connections.SelectedItems.Count > 0 ? connections.SelectedItems[0].Text : "";
            var nextMcpView = Program.Json.Serialize(data["mcps"]);
            if (nextMcpView != mcpView)
            {
                mcpView = nextMcpView;
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
            }
            string panelId =
                panels.SelectedItems.Count > 0
                    ? Program.Text((Dictionary<string, object>)panels.SelectedItems[0].Tag, "id")
                    : "";
            var nextPanelView = Program.Json.Serialize(data["panels"]);
            if (nextPanelView != panelView)
            {
                panelView = nextPanelView;
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
            }
            foreach (var pair in emptyLists)
                pair.Value.Visible = pair.Key.Items.Count == 0;
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
            startControl.Enabled = !operationBusy;
            stopControl.Enabled = false;
            gameValue.Text = "Not connected";
            accountValue.Text = "Unavailable";
            agentValue.Text = "Stopped";
            gameValue.ForeColor =
                accountValue.ForeColor =
                agentValue.ForeColor =
                    Color.FromArgb(145, 161, 167);
            details.Text =
                "Start Wisp to reconnect. If this is your first time, choose the game folder and install the addon.";
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
