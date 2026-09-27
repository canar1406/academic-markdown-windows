using System.Security.Cryptography;
using System.Text;

namespace AcademicMarkdown.Core;

public sealed record FileSnapshot(string Path, string Markdown, string Fingerprint);

public sealed class FileConflictException(string path)
    : IOException($"The file changed outside Academic Markdown: {path}. Reopen it or save a new copy.");

public sealed class AtomicDocumentStore
{
    private static readonly UTF8Encoding Utf8 = new(false, true);
    public const int MaximumDocumentBytes = 16 * 1024 * 1024;

    public Task<FileSnapshot> ReadAsync(string path, CancellationToken cancellationToken = default)
        => Task.Run(async () =>
    {
        path = System.IO.Path.GetFullPath(path);
        if (new FileInfo(path).Length > MaximumDocumentBytes)
            throw new InvalidDataException("This engineering build supports Markdown files up to 16 MiB.");
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        if (bytes.Length > MaximumDocumentBytes) throw new InvalidDataException("Document is too large.");
        return new FileSnapshot(path, Utf8.GetString(bytes), Hash(bytes));
    }, cancellationToken);

    // A null expected fingerprint means create-only, not unrestricted overwrite.
    public Task<string> SaveAsync(string path, string markdown, string? expectedFingerprint,
        CancellationToken cancellationToken = default) => Task.Run(async () =>
    {
        var bytes = Utf8.GetBytes(markdown);
        if (bytes.Length > MaximumDocumentBytes) throw new InvalidDataException("Document is too large.");
        return await WriteBytesAsync(path, bytes, expectedFingerprint, cancellationToken).ConfigureAwait(false);
    }, cancellationToken);

    public static async Task<string?> FingerprintAsync(string path, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path)) return null;
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read,
            FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream, cancellationToken).ConfigureAwait(false));
    }

    public static async Task<string> WriteBytesAsync(string path, byte[] bytes,
        string? expectedFingerprint, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        path = System.IO.Path.GetFullPath(path);
        var directory = System.IO.Path.GetDirectoryName(path)
            ?? throw new InvalidDataException("A destination folder is required.");
        var temporary = System.IO.Path.Combine(directory, $".academic-{Guid.NewGuid():N}.tmp");
        await VerifyExpectedAsync(path, expectedFingerprint, cancellationToken).ConfigureAwait(false);
        try
        {
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write,
                FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes, cancellationToken).ConfigureAwait(false);
                await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
            }
            await VerifyExpectedAsync(path, expectedFingerprint, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            if (expectedFingerprint is null)
                File.Move(temporary, path, overwrite: false);
            else
                File.Replace(temporary, path, destinationBackupFileName: null);
            return Hash(bytes);
        }
        finally
        {
            if (File.Exists(temporary)) File.Delete(temporary);
        }
    }

    private static async Task VerifyExpectedAsync(string path, string? expected, CancellationToken token)
    {
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new InvalidDataException("Save to a regular file, not a link/junction.");
        if (await FingerprintAsync(path, token).ConfigureAwait(false) != expected)
            throw new FileConflictException(path);
    }

    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes));
}
