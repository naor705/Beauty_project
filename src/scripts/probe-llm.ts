import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const result: Record<string, unknown> = {
    key_length: apiKey.length,
    model,
  };
  if (!apiKey) {
    console.log(JSON.stringify({ ...result, ok: false, error: "ANTHROPIC_API_KEY missing" }));
    return;
  }
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 30,
      messages: [{ role: "user", content: "Reply with just the two letters: OK" }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    console.log(
      JSON.stringify({
        ...result,
        ok: true,
        text,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ ...result, ok: false, error: msg.slice(0, 250) }));
  }
}

main();
