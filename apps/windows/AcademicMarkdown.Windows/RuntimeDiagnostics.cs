using System.Text.Json;

namespace AcademicMarkdown.Windows;

/// <summary>Opt-in startup diagnostics only; never records document content.</summary>
internal static class RuntimeDiagnostics
{
    public static void Record(string stage, Exception? exception = null)
    {
        var destination = Environment.GetEnvironmentVariable("ACADEMIC_WINDOWS_DIAGNOSTICS");
        if (string.IsNullOrWhiteSpace(destination)) return;
        try
        {
            var entry = JsonSerializer.Serialize(new
            {
                stage,
                timestamp = DateTimeOffset.UtcNow,
                error = exception?.ToString()
            });
            File.AppendAllText(destination, entry + Environment.NewLine);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
