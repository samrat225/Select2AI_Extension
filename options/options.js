const DEFAULT_ENDPOINT = "https://models.github.ai/inference/chat/completions"

// Available GitHub Models (OpenAI + others)
const GITHUB_MODELS = [
  // OpenAI (GitHub Models)
  { id: "gpt-4.1", name: "GPT-4.1 (OpenAI)" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini (OpenAI)" },
  { id: "gpt-4.1-nano", name: "GPT-4.1 Nano (OpenAI)" },
  { id: "gpt-4o", name: "GPT-4o (OpenAI)" },
  { id: "gpt-4o-nano", name: "GPT-4o Nano (OpenAI)" },
  { id: "gpt-5", name: "GPT-5 (OpenAI)" },
  { id: "gpt-5-chat", name: "GPT-5 Chat (OpenAI)" },
  { id: "gpt-5-nano", name: "GPT-5 Nano (OpenAI)" },
  { id: "o1", name: "O1 (OpenAI)" },
  { id: "o1-mini", name: "O1 Mini (OpenAI)" },
  { id: "o1-preview", name: "O1 Preview (OpenAI)" },
  { id: "o3", name: "O3 (OpenAI)" },
  { id: "o3-mini", name: "O3 Mini (OpenAI)" },
  { id: "o4-mini", name: "O4 Mini (OpenAI)" },

  // Meta Llama
  { id: "meta-llama/Meta-Llama-3.1-8B-Instruct", name: "Llama 3.1 8B (Meta)" },
  { id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B (Meta)" },
  { id: "meta-llama/Meta-Llama-3.1-405B-Instruct", name: "Llama 3.1 405B (Meta)" },

  // Mistral
  { id: "mistralai/Mistral-large", name: "Mistral Large (Mistral AI)" },
  { id: "mistralai/Mistral-large-2407", name: "Mistral Large 2407 (Mistral AI)" },
  { id: "mistralai/Mistral-Nemo", name: "Mistral Nemo (Mistral AI)" },
  { id: "mistralai/Mistral-small", name: "Mistral Small (Mistral AI)" },

  // Cohere
  { id: "cohere/Cohere-command-r", name: "Command R (Cohere)" },
  { id: "cohere/Cohere-command-r-plus", name: "Command R+ (Cohere)" },

  // AI21
  { id: "AI21-Jamba-Instruct", name: "Jamba Instruct (AI21)" },
]

const tokenEl = document.getElementById("token")
const modelEl = document.getElementById("model")
const statusEl = document.getElementById("status")
const saveBtn = document.getElementById("save")
const testBtn = document.getElementById("test")

// Initialize
;(async function init() {
  // Populate model dropdown
  modelEl.innerHTML = GITHUB_MODELS.map(
    (m) => `<option value="${m.id}">${m.name}</option>`
  ).join("")

  // Load saved settings
  const { ghToken, model } = await chrome.storage.sync.get(["ghToken", "model"])
  tokenEl.value = ghToken || ""
  const desired = model || GITHUB_MODELS[0].id
  // If previously saved model is not in the list, add a temporary option
  if (desired && !GITHUB_MODELS.some((m) => m.id === desired)) {
    const opt = document.createElement("option")
    opt.value = desired
    opt.textContent = `Custom: ${desired}`
    modelEl.insertBefore(opt, modelEl.firstChild)
  }
  modelEl.value = desired
})()

// Save settings
saveBtn.addEventListener("click", async () => {
  const ghToken = tokenEl.value.trim()
  const model = modelEl.value.trim()

  if (!ghToken) {
    showStatus("Please enter a GitHub token", "error")
    return
  }

  if (!model) {
    showStatus("Please select a model", "error")
    return
  }

  try {
    await chrome.storage.sync.set({ ghToken, model, endpoint: DEFAULT_ENDPOINT })
    showStatus("Settings saved successfully!", "success")
  } catch (error) {
    showStatus("Failed to save settings", "error")
  }
})

// Test connection
testBtn.addEventListener("click", async () => {
  const ghToken = tokenEl.value.trim()
  const model = modelEl.value.trim()

  if (!ghToken) {
    showStatus("Please enter a GitHub token first", "error")
    return
  }

  showStatus("Testing connection...", "loading")
  testBtn.disabled = true

  try {
    const res = await fetch(DEFAULT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Reply with just the word: success" },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => "")
      showStatus(`Connection failed: ${res.status} ${errorText || res.statusText}`, "error")
      return
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ""

    if (content) {
      showStatus("✓ Connection successful!", "success")
    } else {
      showStatus("Unexpected response format", "error")
    }
  } catch (error) {
    showStatus(`Connection failed: ${error.message}`, "error")
  } finally {
    testBtn.disabled = false
  }
})

function showStatus(message, type = "loading") {
  statusEl.textContent = message
  statusEl.className = `status ${type}`

  if (type === "success" || type === "error") {
    setTimeout(() => {
      statusEl.textContent = ""
      statusEl.className = "status"
    }, 4000)
  }
}
