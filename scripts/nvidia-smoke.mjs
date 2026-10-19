// Live smoke test for the NVIDIA models the agent can use. Needs NVIDIA_API_KEY in the environment (never printed).
// Usage: NVIDIA_API_KEY=... node scripts/nvidia-smoke.mjs [model-id ...]
const key = process.env.NVIDIA_API_KEY;
if (!key) {
  console.error("NVIDIA_API_KEY is not set; nothing was called.");
  process.exit(2);
}
const base = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const models = process.argv.slice(2).length ? process.argv.slice(2) : ["z-ai/glm-5.3", "z-ai/glm-5.3-flash", "nvidia/nemotron-3.5-super-vl-120b-a12b"];
const tool = { type: "function", function: { name: "get_document_state", description: "Read the board.", parameters: { type: "object", properties: { limit: { type: "integer" } }, additionalProperties: false } } };

const post = async (body) => {
  const res = await fetch(`${base}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  return res;
};
const ask = async (model, extra) => {
  const res = await post({ model, max_tokens: 512, temperature: 0.6, messages: [{ role: "user", content: "Call get_document_state with limit 5." }], ...extra });
  return { status: res.status, json: res.ok && !extra.stream ? await res.json() : null, res };
};

const results = {};
for (const model of models) {
  const r = (results[model] = {});
  try {
    const plain = await ask(model, {});
    r.chat = plain.status;
    const calls = (await ask(model, { tools: [tool], tool_choice: "auto" })).json?.choices?.[0]?.message?.tool_calls;
    r.toolCall = Array.isArray(calls) && calls.length > 0 && (() => { try { JSON.parse(calls[0].function.arguments); return "ok"; } catch { return "malformed-args"; } })();
    const stream = await ask(model, { stream: true });
    const text = stream.status === 200 ? await stream.res.text() : "";
    r.streaming = stream.status === 200 && text.includes("data:") ? "ok" : stream.status;
    r.thinkingKwarg = (await ask(model, { chat_template_kwargs: { enable_thinking: true } })).status;
    r.thinkingOffKwarg = (await ask(model, { chat_template_kwargs: { enable_thinking: false } })).status;
    const img = await post({ model, max_tokens: 16, messages: [{ role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==" } }] }] });
    r.imageInput = img.status;
  } catch (e) {
    r.error = String(e instanceof Error ? e.message : e).replaceAll(key, "[key]").slice(0, 160);
  }
}
console.log(JSON.stringify(results, null, 2));
