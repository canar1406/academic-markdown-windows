using System.Text.Json;

namespace AcademicMarkdown.Core.Tests;

public sealed class BridgeContractTests
{
    [Fact]
    public void NativeDecoderAgreesWithSharedHostContractFixtures()
    {
        using var data = JsonDocument.Parse(File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "Fixtures", "host-envelope-v1.json")));
        foreach (var fixture in data.RootElement.EnumerateArray())
        {
            var exception = Record.Exception(() => BridgeEnvelope.Parse(fixture.GetProperty("envelope").GetRawText()));
            Assert.True(fixture.GetProperty("valid").GetBoolean() == (exception is null),
                fixture.GetProperty("name").GetString());
        }
    }
}
