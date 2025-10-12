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

const modelSelect = document.getElementById("modelSelect")
const statusEl = document.getElementById("status")
const openOptionsBtn = document.getElementById("openOptions")

// Open settings page
openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage()
})

// Model selector change
modelSelect.addEventListener("change", async () => {
  const newModel = modelSelect.value
  if (newModel) {
    await chrome.storage.sync.set({ model: newModel })
    updateStatus()
  }
})

// Initialize
async function init() {
  // Populate model dropdown
  modelSelect.innerHTML = GITHUB_MODELS.map(
    (m) => `<option value="${m.id}">${m.name}</option>`
  ).join("")

  // Load and display current config
  await updateStatus()
}

async function updateStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "ai:getConfig" })
    
    if (!res?.ok || !res.config) {
      statusEl.innerHTML = '<strong>⚠️ Not configured</strong><br>Please open Settings to configure your GitHub token and model.'
      modelSelect.value = GITHUB_MODELS[0].id
      return
    }

  const { model, hasToken } = res.config
    
    // Update model selector, allow custom/unknown model by injecting option
    const desired = model || GITHUB_MODELS[0].id
    if (desired && !GITHUB_MODELS.some(m => m.id === desired)) {
      const opt = document.createElement("option")
      opt.value = desired
      opt.textContent = `Custom: ${desired}`
      modelSelect.insertBefore(opt, modelSelect.firstChild)
    }
    modelSelect.value = desired

    if (!hasToken) {
      statusEl.innerHTML = '<strong>⚠️ Token missing</strong><br>Please add your GitHub token in Settings.'
    } else {
      const modelName = GITHUB_MODELS.find(m => m.id === model)?.name || model
      statusEl.innerHTML = `<strong>✓ Ready</strong><br>Model: ${modelName}<br>Token: Configured`
    }
  } catch (error) {
    statusEl.innerHTML = '<strong>⚠️ Error</strong><br>Failed to load configuration.'
  }
}

// Initialize on load
init()
