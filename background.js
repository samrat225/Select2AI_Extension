const DEFAULT_ENDPOINT = "https://models.github.ai/inference/chat/completions"

// Open options page on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage()
  }
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ai:chat") {
    handleChat(msg.payload)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ ok: false, error: err?.message || String(err) })
      })
    // indicate async response
    return true
  }
  if (msg?.type === "ai:getConfig") {
    chrome.storage.sync.get(["ghToken", "model", "endpoint"]).then((cfg) => {
      sendResponse({
        ok: true,
        config: {
          model: cfg.model || "meta-llama/Meta-Llama-3.1-8B-Instruct",
          endpoint: cfg.endpoint || DEFAULT_ENDPOINT,
          hasToken: Boolean(cfg.ghToken),
        },
      })
    })
    return true
  }
})

async function handleChat({ messages, temperature }) {
  const { ghToken, model, endpoint } = await chrome.storage.sync.get(["ghToken", "model", "endpoint"])

  if (!ghToken) {
    return { ok: false, error: "Missing GitHub token. Open extension options to set it." }
  }

  const reqBody = {
    model: model || "meta-llama/Meta-Llama-3.1-8B-Instruct",
    messages,
    temperature: typeof temperature === "number" ? temperature : 0.2,
  }

  const url = endpoint || DEFAULT_ENDPOINT

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        "Content-Type": "application/json",
        // Some deployments of Models API expect an API version header. If your setup requires it, uncomment and set appropriately:
        // "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify(reqBody),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, error: `API ${res.status}: ${text || res.statusText}` }
    }

    const data = await res.json()
    // Expected shape similar to OpenAI:
    // { choices: [ { message: { role, content } } ] }
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.delta?.content ||
      data?.message?.content ||
      JSON.stringify(data)

    return { ok: true, content }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
