namespace AcademicMarkdown.Core;

public static class SafePaths
{
    private static readonly HashSet<string> Devices = new(
        new[] { "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$" }
            .Concat(Enumerable.Range(1, 9).Select(i => $"COM{i}"))
            .Concat(Enumerable.Range(1, 9).Select(i => $"LPT{i}"))
            .Concat("¹²³".SelectMany(digit => new[] { $"COM{digit}", $"LPT{digit}" })),
        StringComparer.OrdinalIgnoreCase);

    // Apply Windows rules on every host so macOS unit tests catch Windows attacks.
    public static string ValidateRelative(string path)
    {
        if (string.IsNullOrEmpty(path) || path.Length > 1024 ||
            path.Any(c => char.IsControl(c) || "\\:<>\"|?*".Contains(c)))
            throw new InvalidDataException("An asset must have a safe relative path.");

        foreach (var part in path.Split('/'))
        {
            if (part is "" or "." or ".." || part.EndsWith('.') || part.EndsWith(' ') ||
                Devices.Contains(part.Split('.')[0]))
                throw new InvalidDataException($"Unsafe asset path: {path}");
        }
        return path;
    }

    public static string ResolveExistingFile(string root, string relative)
    {
        ValidateRelative(relative);
        var current = Path.GetFullPath(root);
        RejectReparsePoint(current);
        foreach (var part in relative.Split('/'))
        {
            current = Path.Combine(current, part);
            RejectReparsePoint(current);
        }
        if (!File.Exists(current)) throw new FileNotFoundException($"Missing asset: {relative}");
        return current;
    }

    private static void RejectReparsePoint(string path)
    {
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("Linked/junction asset paths are not allowed.");
    }
}
