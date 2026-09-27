namespace AcademicMarkdown.Core;

public readonly record struct RevisionStamp(Guid DocumentId, long Revision);

/// <summary>UI-owned lifecycle state; no Markdown parsing or export semantics.</summary>
public sealed class DocumentSession
{
    public Guid DocumentId { get; private set; } = Guid.NewGuid();
    public long Revision { get; private set; }
    public long PersistedRevision { get; private set; }
    public string? Path { get; private set; }
    public string? Fingerprint { get; private set; }
    public bool IsDirty => Revision != PersistedRevision;
    public RevisionStamp Stamp => new(DocumentId, Revision);

    public void Replace(string? path, string? fingerprint)
    {
        DocumentId = Guid.NewGuid();
        Revision = PersistedRevision = 0;
        Path = path;
        Fingerprint = fingerprint;
    }

    public void ObserveRevision(long revision)
    {
        if (revision < 0 || revision > 9_007_199_254_740_991)
            throw new InvalidDataException("Invalid editor revision.");
        Revision = Math.Max(Revision, revision);
    }

    public bool IsCurrent(RevisionStamp stamp) => Stamp == stamp;

    public void Saved(RevisionStamp stamp, string path, string fingerprint)
    {
        if (stamp.DocumentId != DocumentId) return;
        if (stamp.Revision > Revision) throw new InvalidOperationException("Cannot save a future revision.");
        Path = path;
        Fingerprint = fingerprint;
        PersistedRevision = stamp.Revision;
    }
}
