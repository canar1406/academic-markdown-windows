using System.Text.Json;
using System.Text.Json.Serialization;

namespace AcademicMarkdown.Core;

public sealed record BridgeEnvelope(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("requestId")] string? RequestId,
    [property: JsonPropertyName("payload")] JsonElement Payload)
{
    public static BridgeEnvelope Parse(string json)
    {
        if (json.Length > 24 * 1024 * 1024) throw new InvalidDataException("Bridge message is too large.");
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 64 });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Expected a bridge object.");
            var names = new HashSet<string>(StringComparer.Ordinal);
            if (root.EnumerateObject().Any(property => !names.Add(property.Name)))
                throw new InvalidDataException("Duplicate bridge fields are not allowed.");
            if (!root.TryGetProperty("protocolVersion", out var protocol) ||
                protocol.ValueKind != JsonValueKind.Number || !protocol.TryGetInt32(out var version) || version != 1)
                throw new InvalidDataException("Unsupported bridge protocol. Expected version 1.");
            if (!root.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String ||
                type.GetString() is not { Length: > 0 and <= 128 } messageType || string.IsNullOrWhiteSpace(messageType))
                throw new InvalidDataException("Invalid bridge message type.");
            if (!root.TryGetProperty("requestId", out var request) ||
                request.ValueKind is not (JsonValueKind.Null or JsonValueKind.String) ||
                (request.ValueKind == JsonValueKind.String && request.GetString()!.Length > 128))
                throw new InvalidDataException("Invalid bridge request ID.");
            if (!root.TryGetProperty("payload", out var payload) || payload.ValueKind != JsonValueKind.Object)
                throw new InvalidDataException("Invalid bridge payload.");
            return new BridgeEnvelope(version, messageType, request.GetString(), payload.Clone());
        }
        catch (JsonException error)
        {
            throw new InvalidDataException("Malformed bridge JSON.", error);
        }
    }
    public static BridgeEnvelope Create(string type, string? requestId, object payload)
        => new(1, type, requestId, JsonSerializer.SerializeToElement(payload));
    public string ToJson() => JsonSerializer.Serialize(this);
    public long ReadRevision()
    {
        if (!Payload.TryGetProperty("revision", out var value) || value.ValueKind != JsonValueKind.Number ||
            !value.TryGetInt64(out var revision) || revision is < 0 or > 9_007_199_254_740_991)
            throw new InvalidDataException("Invalid or missing document revision.");
        return revision;
    }
}
