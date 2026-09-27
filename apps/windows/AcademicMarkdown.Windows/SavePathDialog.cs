using System.Runtime.InteropServices;
using System.Text;

namespace AcademicMarkdown.Windows;

/// <summary>Path selection only. Output remains untouched until the atomic commit.</summary>
internal static class SavePathDialog
{
    internal const uint NoTestFileCreate = 0x00010000;
    internal const uint NoChangeDirectory = 0x00000008;
    internal const uint PathMustExist = 0x00000800;
    internal const uint Explorer = 0x00080000;
    internal const uint NoDereferenceLinks = 0x00100000;

    internal static OpenFileName CreateOptions(nint owner, string name, string extension)
    {
        if (extension is not (".md" or ".pdf"))
            throw new ArgumentException("Only Markdown and PDF destinations are supported.", nameof(extension));
        return new OpenFileName
        {
            StructSize = (uint)Marshal.SizeOf<OpenFileName>(),
            Owner = owner,
            Filter = extension == ".pdf" ? "PDF document (*.pdf)\0*.pdf\0\0" : "Markdown document (*.md)\0*.md\0\0",
            FilterIndex = 1,
            MaxFile = 32768,
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            Title = $"Save {name}",
            DefaultExtension = extension.TrimStart('.'),
            // Native selection must not create/truncate an output or follow a .lnk.
            // Overwrite consent is handled only after fingerprinting the selected path.
            Flags = Explorer | PathMustExist | NoChangeDirectory | NoTestFileCreate | NoDereferenceLinks
        };
    }

    public static string? Pick(nint owner, string name, string extension)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Requires Windows.");
        var options = CreateOptions(owner, name, extension);
        var buffer = Marshal.AllocHGlobal(checked((int)options.MaxFile * 2));
        try
        {
            var bytes = new byte[options.MaxFile * 2];
            var suggestedName = Path.GetFileName(name);
            if (suggestedName.Length > 240 || suggestedName.Contains('\0')) suggestedName = "report";
            Encoding.Unicode.GetBytes(suggestedName + extension + '\0').CopyTo(bytes, 0);
            Marshal.Copy(bytes, 0, buffer, bytes.Length);
            options.File = buffer;
            if (!GetSaveFileName(ref options))
            {
                var error = CommDlgExtendedError();
                if (error == 0) return null;
                throw new IOException($"The native Save dialog failed (0x{error:X}).");
            }
            var selected = Marshal.PtrToStringUni(buffer);
            if (string.IsNullOrEmpty(selected)) return null;
            if (!string.Equals(Path.GetExtension(selected), extension, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"Select a file ending in {extension}.");
            return Path.GetFullPath(selected);
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    [DllImport("comdlg32.dll", EntryPoint = "GetSaveFileNameW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSaveFileName(ref OpenFileName options);

    [DllImport("comdlg32.dll", ExactSpelling = true)]
    private static extern uint CommDlgExtendedError();

    // OPENFILENAMEW layout, including reserved tail fields, for Windows x64.
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct OpenFileName
    {
        public uint StructSize;
        public nint Owner;
        public nint Instance;
        [MarshalAs(UnmanagedType.LPWStr)] public string? Filter;
        public nint CustomFilter;
        public uint MaxCustomFilter;
        public uint FilterIndex;
        public nint File;
        public uint MaxFile;
        public nint FileTitle;
        public uint MaxFileTitle;
        [MarshalAs(UnmanagedType.LPWStr)] public string? InitialDirectory;
        [MarshalAs(UnmanagedType.LPWStr)] public string? Title;
        public uint Flags;
        public ushort FileOffset;
        public ushort ExtensionOffset;
        [MarshalAs(UnmanagedType.LPWStr)] public string? DefaultExtension;
        public nint CustomData;
        public nint Hook;
        public nint TemplateName;
        public nint Reserved;
        public uint ReservedWord;
        public uint ExtendedFlags;
    }
}
