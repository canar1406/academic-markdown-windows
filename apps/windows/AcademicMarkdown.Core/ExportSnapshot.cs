using System.Text.Json;

namespace AcademicMarkdown.Core;

public sealed record ExportSnapshot(string Latex, IReadOnlyList<string> AssetPaths, long Revision,
    IReadOnlyList<string> Errors)
{
    public static ExportSnapshot Decode(BridgeEnvelope envelope)
    {
        if (envelope.Type != "export.latex")
            throw new InvalidDataException("Expected the shared exporter's LaTeX response.");
        var payload = envelope.Payload;
        if (!payload.TryGetProperty("latex", out var latex) || latex.ValueKind != JsonValueKind.String ||
            latex.GetString() is not { Length: <= 16 * 1024 * 1024 } text ||
            !payload.TryGetProperty("assetPaths", out var paths) || paths.ValueKind != JsonValueKind.Array ||
            paths.GetArrayLength() > 1024 ||
            !payload.TryGetProperty("diagnostics", out var diagnostics) || diagnostics.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("Invalid LaTeX export response.");
        var assets = new List<string>();
        foreach (var path in paths.EnumerateArray())
        {
            if (path.ValueKind != JsonValueKind.String) throw new InvalidDataException("Invalid export asset.");
            assets.Add(SafePaths.ValidateRelative(path.GetString()!));
        }
        var errors = new List<string>();
        foreach (var diagnostic in diagnostics.EnumerateArray())
        {
            if (diagnostic.ValueKind != JsonValueKind.Object ||
                !diagnostic.TryGetProperty("severity", out var severity) || severity.ValueKind != JsonValueKind.String ||
                !diagnostic.TryGetProperty("message", out var message) || message.ValueKind != JsonValueKind.String)
                throw new InvalidDataException("Invalid exporter diagnostic.");
            if (severity.GetString() is not ("info" or "warning" or "error"))
                throw new InvalidDataException("Unsupported exporter diagnostic severity.");
            if (severity.GetString() == "error") errors.Add(message.GetString()!);
        }
        if (text.Length == 0 && errors.Count == 0)
            throw new InvalidDataException("The exporter returned no LaTeX and no diagnostic.");
        return new ExportSnapshot(text, assets, envelope.ReadRevision(), errors);
    }
}
