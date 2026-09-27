using AcademicMarkdown.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32.SafeHandles;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Windows.Storage.Streams;

namespace AcademicMarkdown.Windows;

/// <summary>No document-directory mapping: only bounded, validated image reads.</summary>
internal sealed class DocumentImageHandler
{
    internal const string HostName = "document.academic-markdown.invalid";
    private const int MaximumImageBytes = 20 * 1024 * 1024;
    private static readonly IReadOnlyDictionary<string, string> MimeTypes =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg",
            [".gif"] = "image/gif", [".webp"] = "image/webp"
        };

    public string? DocumentRoot { get; set; }

    public async Task<CoreWebView2WebResourceResponse> RespondAsync(CoreWebView2Environment environment,
        string address, string? root, CancellationToken cancellationToken)
    {
        if (root is null) return EmptyResponse(environment, 404);
        try
        {
            var uri = new Uri(address, UriKind.Absolute);
            if (uri.Scheme != "https" || uri.Host != HostName || !uri.IsDefaultPort ||
                uri.UserInfo.Length != 0 || uri.Query.Length != 0 || uri.Fragment.Length != 0)
                return EmptyResponse(environment, 403);

            // Decode exactly once. Encoded separators/colon/traversal then go through
            // the same portable Windows-path validator used by the compiler.
            // Validate the original path, not Uri.AbsolutePath (which normalizes '..').
            const string prefix = "https://" + HostName + "/";
            if (!address.StartsWith(prefix, StringComparison.Ordinal)) return EmptyResponse(environment, 403);
            var relative = Uri.UnescapeDataString(address[prefix.Length..]);
            SafePaths.ValidateRelative(relative);
            if (!MimeTypes.TryGetValue(Path.GetExtension(relative), out var mime))
                return EmptyResponse(environment, 403);

            var bytes = await Task.Run(async () =>
            {
                var path = SafePaths.ResolveExistingFile(root, relative);
                for (var directory = new DirectoryInfo(root); directory is not null; directory = directory.Parent)
                    if ((directory.Attributes & FileAttributes.ReparsePoint) != 0)
                        throw new InvalidDataException("Linked image directories are not allowed.");
                await using var file = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
                if (file.Length > MaximumImageBytes) throw new InvalidDataException("Image is too large.");
                // Recheck all components after opening; no symlinks or junctions are allowed.
                SafePaths.ResolveExistingFile(root, relative);
                VerifyOpenedPath(file.SafeFileHandle, path);
                var result = new byte[checked((int)file.Length)];
                await file.ReadExactlyAsync(result, cancellationToken).ConfigureAwait(false);
                return result;
            }, cancellationToken);

            cancellationToken.ThrowIfCancellationRequested();
            if (!StringComparer.Ordinal.Equals(root, DocumentRoot)) return EmptyResponse(environment, 409);
            var stream = new InMemoryRandomAccessStream();
            try
            {
                using (var writer = new DataWriter(stream))
                {
                    writer.WriteBytes(bytes);
                    await writer.StoreAsync();
                    writer.DetachStream();
                }
                stream.Seek(0);
                // WebView2 retains the response stream; do not dispose it before consumption.
                return environment.CreateWebResourceResponse(stream, 200, "OK",
                    $"Content-Type: {mime}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n" +
                    "Access-Control-Allow-Origin: https://editor.academic-markdown.invalid\r\n");
            }
            catch { stream.Dispose(); throw; }
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or
            ArgumentException or UriFormatException or Win32Exception)
        {
            return EmptyResponse(environment, 403);
        }
    }

    private static void VerifyOpenedPath(SafeFileHandle handle, string expected)
    {
        // The opened handle must still refer to the exact approved path, even if a
        // junction was swapped between validation and FileStream.Open.
        var buffer = new StringBuilder(32768);
        var length = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        if (length >= buffer.Capacity) throw new InvalidDataException("Image path is too long.");
        var actual = buffer.ToString();
        if (actual.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) actual = @"\\" + actual[8..];
        else if (actual.StartsWith(@"\\?\", StringComparison.Ordinal)) actual = actual[4..];
        if (!string.Equals(Path.GetFullPath(expected), actual, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("The image path changed during validation.");
    }

    [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path,
        uint length, uint flags);

    internal static CoreWebView2WebResourceResponse EmptyResponse(
        CoreWebView2Environment environment, int status) =>
        environment.CreateWebResourceResponse(null, status, "Blocked",
            "Content-Type: text/plain\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n");
}
