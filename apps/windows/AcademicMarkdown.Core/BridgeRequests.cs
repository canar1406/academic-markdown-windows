using System.Collections.Concurrent;

namespace AcademicMarkdown.Core;

/// <summary>Correlates only host-initiated operations, never accepts native commands from content.</summary>
public sealed class BridgeRequests : IDisposable
{
    private sealed record Pending(string ResponseType, TaskCompletionSource<BridgeEnvelope> Completion);
    private readonly ConcurrentDictionary<string, Pending> pending = new();
    private bool disposed;

    public async Task<BridgeEnvelope> RequestAsync(Action<BridgeEnvelope> send, string type, object payload,
        string responseType, CancellationToken cancellationToken = default, TimeSpan? timeout = null)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        cancellationToken.ThrowIfCancellationRequested();
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<BridgeEnvelope>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = new Pending(responseType, completion);
        try
        {
            send(BridgeEnvelope.Create(type, id, payload));
            return await completion.Task.WaitAsync(timeout ?? TimeSpan.FromSeconds(15), cancellationToken)
                .ConfigureAwait(false);
        }
        finally
        {
            pending.TryRemove(id, out _);
        }
    }

    public bool Receive(BridgeEnvelope envelope)
    {
        if (envelope.RequestId is not { } id || !pending.TryGetValue(id, out var request) ||
            request.ResponseType != envelope.Type || !pending.TryRemove(id, out _))
            return false;
        return request.Completion.TrySetResult(envelope);
    }

    public void Dispose()
    {
        disposed = true;
        foreach (var id in pending.Keys)
            if (pending.TryRemove(id, out var request))
                request.Completion.TrySetException(new ObjectDisposedException(nameof(BridgeRequests)));
    }
}
