using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

partial class WispWindow
{
    Panel pageHost;
    Label pageHeading,
        pageCaption,
        feedback,
        gameValue,
        accountValue,
        agentValue;
    readonly Dictionary<string, Panel> pages = new Dictionary<string, Panel>();
    readonly Dictionary<string, Button> navigation = new Dictionary<string, Button>();
    readonly Dictionary<string, string> captions = new Dictionary<string, string>();
    bool operationBusy;
    DateTime feedbackUntil;
    bool previewing;
    Button startControl,
        stopControl;
    string automaticModelsAccount = "";

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            int dark = 1;
            DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
        }
        catch (DllNotFoundException) { }
    }

    protected override bool ShowWithoutActivation
    {
        get { return previewing; }
    }
    readonly Dictionary<ListView, Label> emptyLists = new Dictionary<ListView, Label>();

    void BuildShell()
    {
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        Size = new Size(1060, 760);
        MinimumSize = new Size(1040, 720);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var rail = new Panel
        {
            Dock = DockStyle.Left,
            Width = 208,
            BackColor = Color.FromArgb(15, 19, 22),
        };
        Controls.Add(rail);
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Wisp.Brand"))
            if (stream != null)
            {
                var picture = new PictureBox
                {
                    Image = new Bitmap(Image.FromStream(stream)),
                    SizeMode = PictureBoxSizeMode.Zoom,
                    Location = new Point(18, 24),
                    Size = new Size(48, 56),
                };
                rail.Controls.Add(picture);
            }
        Label(rail, "Wisp", 74, 28).Font = new Font("Segoe UI", 23, FontStyle.Bold);
        Label(rail, "A little help in Azeroth.", 23, 91).ForeColor = Color.FromArgb(130, 145, 150);
        var edition = Label(rail, "WOW FOREVER  /  WINDOWS", 23, 640);
        edition.Font = new Font("Segoe UI", 8);
        edition.ForeColor = Color.FromArgb(105, 122, 128);
        edition.Anchor = AnchorStyles.Bottom | AnchorStyles.Left;
        pageHeading = Label(this, "Your companion, connected.", 238, 28);
        pageHeading.Font = new Font("Segoe UI", 22, FontStyle.Bold);
        pageCaption = Label(
            this,
            "Everything Wisp needs before you head back into the game.",
            240,
            73
        );
        pageCaption.ForeColor = Color.FromArgb(145, 161, 167);
        pageCaption.Font = new Font("Segoe UI", 10);
        state = Label(this, "Checking connection...", 240, 110);
        state.Font = new Font("Segoe UI", 9);
        state.ForeColor = Gold;
        pageHost = new Panel
        {
            Location = new Point(222, 140),
            Size = new Size(806, 510),
            Anchor =
                AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right,
        };
        Controls.Add(pageHost);
        feedback = Label(
            this,
            "Wisp stays available in your system tray when you close this window.",
            240,
            674
        );
        feedback.AutoSize = false;
        feedback.Size = new Size(780, 36);
        feedback.Font = new Font("Segoe UI", 9);
        feedback.ForeColor = Color.FromArgb(145, 161, 167);
        feedback.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        string[] names =
        {
            "Overview",
            "Connections",
            "Tools & MCPs",
            "Panels",
            "Suggestions",
            "Diagnostics",
        };
        string[] hints =
        {
            "Your companion, connected.",
            "Your AI, connected.",
            "Give Wisp more to work with.",
            "Keep the useful things close.",
            "A nudge at the right moment.",
            "A closer look.",
        };
        string[] descriptions =
        {
            "Everything Wisp needs before you head back into the game.",
            "Manage the AI connections Wisp can use.",
            "Connect tools and data sources, then choose what Wisp can access.",
            "Manage the trackers and panels you have created in WoW.",
            "Choose when Wisp can offer a little guidance on its own.",
            "Connection details and local activity when you need them.",
        };
        for (int i = 0; i < names.Length; i++)
        {
            string name = names[i];
            var nav = new WispButton
            {
                Text = name,
                Location = new Point(14, 155 + i * 51),
                Size = new Size(180, 42),
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(16, 0, 0, 0),
                BackColor = rail.BackColor,
                ForeColor = Color.FromArgb(155, 171, 177),
                FlatStyle = FlatStyle.Flat,
            };
            nav.FlatAppearance.BorderSize = 0;
            nav.Tag = hints[i];
            nav.Click += delegate
            {
                ShowPage(name);
            };
            rail.Controls.Add(nav);
            navigation[name] = nav;
            captions[name] = descriptions[i];
        }
    }

    Panel Page(string name)
    {
        var page = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Bg,
            ForeColor = Ink,
            AutoScroll = true,
            Visible = false,
        };
        pageHost.Controls.Add(page);
        pages[name] = page;
        return page;
    }

    void ShowPage(string name)
    {
        if (!pages.ContainsKey(name))
            return;
        foreach (var pair in pages)
            pair.Value.Visible = pair.Key == name;
        pages[name].BringToFront();
        pageHeading.Text = Convert.ToString(navigation[name].Tag);
        pageCaption.Text = captions[name];
        foreach (var pair in navigation)
        {
            pair.Value.BackColor =
                pair.Key == name ? Color.FromArgb(30, 49, 50) : Color.FromArgb(15, 19, 22);
            pair.Value.ForeColor = pair.Key == name ? Gold : Color.FromArgb(155, 171, 177);
        }
    }

    void BindSelectionActions(Panel page, ListView list, string alwaysEnabled)
    {
        var empty = Label(
            page,
            alwaysEnabled == "Add MCP"
                ? "No integrations yet. Add an MCP connection to get started."
                : "No saved panels yet. Ask Wisp to create one in game.",
            42,
            145
        );
        empty.Font = new Font("Segoe UI", 11);
        empty.BackColor = Surface;
        empty.ForeColor = Color.FromArgb(145, 161, 167);
        emptyLists[list] = empty;
        Action update = delegate
        {
            foreach (Control control in page.Controls)
                if (control is Button && control.Text != alwaysEnabled)
                    control.Enabled = list.SelectedItems.Count > 0;
        };
        list.SelectedIndexChanged += delegate
        {
            update();
        };
        update();
    }

    static void StyleCombo(ComboBox combo)
    {
        combo.BackColor = Surface;
        combo.ForeColor = Ink;
        combo.FlatStyle = FlatStyle.Flat;
        combo.DrawMode = DrawMode.OwnerDrawFixed;
        combo.ItemHeight = 26;
        combo.DrawItem += delegate(object sender, DrawItemEventArgs e)
        {
            using (
                var brush = new SolidBrush(
                    (e.State & DrawItemState.Selected) != 0 ? Color.FromArgb(41, 67, 66) : Surface
                )
            )
                e.Graphics.FillRectangle(brush, e.Bounds);
            if (e.Index >= 0)
                TextRenderer.DrawText(
                    e.Graphics,
                    Convert.ToString(combo.Items[e.Index]),
                    combo.Font,
                    e.Bounds,
                    Ink,
                    TextFormatFlags.VerticalCenter
                        | TextFormatFlags.Left
                        | TextFormatFlags.EndEllipsis
                );
        };
    }

    void Notice(string text, bool error)
    {
        feedback.Text = text;
        feedback.ForeColor = error ? Color.FromArgb(240, 151, 133) : Gold;
        feedbackUntil = DateTime.UtcNow.AddSeconds(error ? 15 : 5);
    }

    Panel Card(
        Control parent,
        string title,
        string description,
        int x,
        int y,
        int width,
        int height
    )
    {
        var card = new WispCard
        {
            Location = new Point(x, y),
            Size = new Size(width, height),
            BackColor = Surface,
        };
        parent.Controls.Add(card);
        var titleLabel = Label(card, title, 20, 17);
        titleLabel.Font = new Font("Segoe UI Semibold", 11, FontStyle.Bold);
        if (description.Length > 0)
        {
            var caption = Label(card, description, 20, 47);
            caption.AutoSize = false;
            caption.Size = new Size(width - 40, 42);
            caption.Font = new Font("Segoe UI", 9);
            caption.ForeColor = Color.FromArgb(145, 161, 167);
        }
        return card;
    }

    void UpdateDashboard(Dictionary<string, object> data)
    {
        bool ready = Program.Text(data, "ready") == "True";
        bool game = Program.Text(data, "gameConnected") == "True";
        var auth = data.ContainsKey("auth") ? data["auth"] as Dictionary<string, object> : null;
        bool connected = auth != null && Program.Text(auth, "status") == "connected";
        gameValue.Text = game ? "Connected" : "Waiting for WoW";
        gameValue.ForeColor = game ? Gold : Color.FromArgb(210, 186, 136);
        accountValue.Text = connected ? "ChatGPT" : "Not connected";
        accountValue.ForeColor = connected ? Gold : Color.FromArgb(210, 186, 136);
        agentValue.Text =
            !ready ? "Starting..."
            : Program.Text(data, "activeTurns") == "0" ? "Ready to help"
            : "Working...";
        agentValue.ForeColor = Gold;
        startControl.Enabled = false;
        stopControl.Enabled = Program.Text(data, "activeTurns") == "0" && !operationBusy;
        foreach (var pair in emptyLists)
            pair.Value.Visible = pair.Key.Items.Count == 0;
        details.Text =
            !connected
                ? "Add an AI connection to start asking questions. Your existing chats stay on this computer."
            : !game ? "Open WoW and enable Wisp AI. Already in game? Type /reload to reconnect."
            : "You are all set. Open /wisp in game, or hover an item and use your inline shortcut.";
        if (!operationBusy && feedbackUntil < DateTime.UtcNow)
        {
            feedback.Text = "Wisp stays available in your system tray when you close this window.";
            feedback.ForeColor = Color.FromArgb(145, 161, 167);
        }
    }

    public void RenderPreview(string file, string page)
    {
        if (pages.ContainsKey(page))
            ShowPage(page);
        previewing = true;
        ShowInTaskbar = false;
        Opacity = 0;
        Show();
        Application.DoEvents();
        CreateControl();
        foreach (Control child in Controls)
            child.CreateControl();
        PerformLayout();
        using (var bitmap = new Bitmap(Width, Height))
        {
            DrawToBitmap(bitmap, new Rectangle(0, 0, Width, Height));
            bitmap.Save(file, System.Drawing.Imaging.ImageFormat.Png);
        }
        Hide();
    }

    public void ValidateUi()
    {
        if (Icon == null || pages.Count != 6)
            throw new InvalidOperationException("Missing app icon or navigation page.");
        foreach (var page in pages)
        {
            ShowPage(page.Key);
            if (pageHeading.Text != Convert.ToString(navigation[page.Key].Tag))
                throw new InvalidOperationException("Navigation did not update.");
        }
        var auth = new Dictionary<string, object> { { "status", "connected" } };
        var data = new Dictionary<string, object>
        {
            { "auth", auth },
            { "ready", true },
            { "gameConnected", false },
            { "activeTurns", 0 },
        };
        UpdateDashboard(data);
        if (
            gameValue.Text != "Waiting for WoW"
            || agentValue.Text != "Ready to help"
            || startControl.Enabled
            || !stopControl.Enabled
        )
            throw new InvalidOperationException("Connection state is inconsistent.");
        data["gameConnected"] = true;
        data["activeTurns"] = 1;
        UpdateDashboard(data);
        if (agentValue.Text != "Working..." || stopControl.Enabled || gameValue.Text != "Connected")
            throw new InvalidOperationException("Active-turn controls are inconsistent.");
        Guard(
                delegate
                {
                    throw new InvalidOperationException("Expected test error");
                }
            )
            .GetAwaiter()
            .GetResult();
        if (operationBusy || feedback.Text != "Expected test error")
            throw new InvalidOperationException("Error feedback did not recover.");
    }
}

class WispCard : Panel
{
    public WispCard()
    {
        DoubleBuffered = true;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        e.Graphics.Clear(Parent == null ? BackColor : Parent.BackColor);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using (var shape = new GraphicsPath())
        {
            int size = 18;
            shape.AddArc(0, 0, size, size, 180, 90);
            shape.AddArc(Width - size - 1, 0, size, size, 270, 90);
            shape.AddArc(Width - size - 1, Height - size - 1, size, size, 0, 90);
            shape.AddArc(0, Height - size - 1, size, size, 90, 90);
            shape.CloseFigure();
            using (var fill = new SolidBrush(BackColor))
                e.Graphics.FillPath(fill, shape);
            using (var pen = new Pen(Color.FromArgb(46, 57, 62)))
                e.Graphics.DrawPath(pen, shape);
        }
    }
}

class WispButton : Button
{
    public bool Primary;
    bool hovered;

    public WispButton()
    {
        Cursor = Cursors.Hand;
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderColor = Color.FromArgb(58, 76, 79);
        FlatAppearance.MouseOverBackColor = Color.FromArgb(46, 67, 68);
        FlatAppearance.MouseDownBackColor = Color.FromArgb(37, 85, 80);
        UseVisualStyleBackColor = false;
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        hovered = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        hovered = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.Clear(Parent == null ? BackColor : Parent.BackColor);
        var fill =
            Primary ? Color.FromArgb(119, 219, 198)
            : hovered ? Color.FromArgb(41, 62, 64)
            : BackColor;
        using (var shape = new GraphicsPath())
        {
            const int r = 12;
            shape.AddArc(0, 0, r, r, 180, 90);
            shape.AddArc(Width - r - 1, 0, r, r, 270, 90);
            shape.AddArc(Width - r - 1, Height - r - 1, r, r, 0, 90);
            shape.AddArc(0, Height - r - 1, r, r, 90, 90);
            shape.CloseFigure();
            using (var brush = new SolidBrush(Enabled ? fill : Color.FromArgb(25, 31, 35)))
                e.Graphics.FillPath(brush, shape);
            if (FlatAppearance.BorderSize > 0)
                using (var pen = new Pen(Color.FromArgb(58, 76, 79)))
                    e.Graphics.DrawPath(pen, shape);
        }
        var bounds = new Rectangle(Padding.Left + 5, 0, Width - Padding.Horizontal - 10, Height);
        var align =
            TextAlign == ContentAlignment.MiddleLeft
                ? TextFormatFlags.Left
                : TextFormatFlags.HorizontalCenter;
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            bounds,
            Enabled
                ? (Primary ? Color.FromArgb(16, 35, 34) : ForeColor)
                : Color.FromArgb(101, 117, 122),
            align
                | TextFormatFlags.VerticalCenter
                | TextFormatFlags.EndEllipsis
                | TextFormatFlags.NoPrefix
        );
        if (Focused && ShowFocusCues)
            ControlPaint.DrawFocusRectangle(e.Graphics, new Rectangle(4, 4, Width - 8, Height - 8));
    }
}
