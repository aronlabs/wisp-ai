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

static class Program
{
    public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
        Path.DirectorySeparatorChar
    );
    public static readonly JavaScriptSerializer Json = new JavaScriptSerializer
    {
        MaxJsonLength = 2000000,
    };

    static string Hash(string text)
    {
        using (var sha = SHA256.Create())
            return BitConverter
                .ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text)))
                .Replace("-", "")
                .ToLowerInvariant();
    }

    static string SecretPath(string key)
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "WispAI",
            "Secrets",
            Hash(Root),
            Hash(key) + ".bin"
        );
    }

    static void MigrateSecrets()
    {
        var destination = Path.GetDirectoryName(SecretPath("migration"));
        var marker = Path.Combine(destination, ".renamed-from-companion");
        if (File.Exists(marker))
            return;
        var previous = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "WoWCompanion",
            "Secrets",
            Hash(Root)
        );
        Directory.CreateDirectory(destination);
        if (Directory.Exists(previous))
            foreach (var file in Directory.GetFiles(previous, "*.bin"))
            {
                var target = Path.Combine(destination, Path.GetFileName(file));
                if (!File.Exists(target))
                    File.Copy(file, target, false);
            }
        File.WriteAllText(marker, "Wisp AI credential migration completed.");
    }

    static void WriteSecret(string file, byte[] data)
    {
        var temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(temporary, data);
            if (File.Exists(file))
                File.Replace(temporary, file, null);
            else
                File.Move(temporary, file);
        }
        finally
        {
            if (File.Exists(temporary))
                File.Delete(temporary);
        }
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "--secret")
        {
            Console.SetIn(new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false)));
            Console.SetOut(
                new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false))
                {
                    AutoFlush = true,
                }
            );
            try
            {
                MigrateSecrets();
                var file = SecretPath(args[2]);
                if (args[1] == "read")
                {
                    if (File.Exists(file))
                        Console.Write(
                            Encoding.UTF8.GetString(
                                ProtectedData.Unprotect(
                                    File.ReadAllBytes(file),
                                    null,
                                    DataProtectionScope.CurrentUser
                                )
                            )
                        );
                }
                else if (args[1] == "write")
                {
                    string value = Console.In.ReadToEnd();
                    Directory.CreateDirectory(Path.GetDirectoryName(file));
                    if (value.Length == 0)
                    {
                        if (File.Exists(file))
                            File.Delete(file);
                    }
                    else
                        WriteSecret(
                            file,
                            ProtectedData.Protect(
                                Encoding.UTF8.GetBytes(value),
                                null,
                                DataProtectionScope.CurrentUser
                            )
                        );
                }
                else
                    return 2;
                return 0;
            }
            catch (Exception e)
            {
                Console.Error.Write(e.GetType().Name + ": " + e.Message);
                return 1;
            }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        if (args.Length == 1 && args[0] == "--self-test")
        {
            using (var test = new WispWindow(false)) { }
            return 0;
        }
        bool created;
        using (
            var mutex = new Mutex(true, "Local\\WispAI-" + Hash(Root).Substring(0, 20), out created)
        )
        {
            if (!created)
            {
                MessageBox.Show("Wisp is already running. Open it from the system tray.", "Wisp");
                return 0;
            }
            Application.Run(new WispWindow(true));
        }
        return 0;
    }

    public static Dictionary<string, object> Parse(string text)
    {
        return Json.Deserialize<Dictionary<string, object>>(text);
    }

    public static string Text(Dictionary<string, object> data, string key, string fallback = "")
    {
        object value;
        return data != null && data.TryGetValue(key, out value) && value != null
            ? Convert.ToString(value)
            : fallback;
    }

    public static string Quote(string value)
    {
        var b = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\')
            {
                slashes++;
                continue;
            }
            if (c == '\"')
            {
                b.Append('\\', slashes * 2 + 1);
                b.Append(c);
            }
            else
            {
                b.Append('\\', slashes);
                b.Append(c);
            }
            slashes = 0;
        }
        b.Append('\\', slashes * 2);
        return b.Append('"').ToString();
    }
}
