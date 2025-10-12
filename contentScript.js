;(() => {
  const STATE = {
    selectionText: "",
    isOpen: false,
    theme: null,
    showingMenu: false,
  }
  const MAX_SELECTION_CHARS = 6000
  const SHADOW_ID = "aixt-select2ai-root"
  const CSS_URL = chrome.runtime.getURL("styles/floating.css")
  const GSAP_URL = chrome.runtime.getURL("vendor/gsap.min.js")

  // Load GSAP dynamically
  let gsapLoaded = false
  function loadGSAP() {
    return new Promise((resolve) => {
      const s = document.createElement("script")
      s.src = GSAP_URL
      s.onload = () => {
        gsapLoaded = !!window.gsap
        resolve(gsapLoaded)
      }
      s.onerror = () => resolve(false)
      document.documentElement.appendChild(s)
    })
  }

  // Icons
  const Icons = (() => {
    const base = (d, size = 20) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`
    return {
      sparkles: base("M12 3l1.8 3.9L18 8.7l-3.6 3.3L15 18l-3-1.9L9 18l.6-6L6 8.7l4.2-1.8L12 3z"),
      x: base("M18 6L6 18M6 6l12 12"),
      send: base("M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z"),
      info: base("M13 16h-1v-4h-1M12 8h.01"),
      help: base("M9 9a3 3 0 1 1 3 3v1M12 17h.01"),
      text: base("M4 7V5h16v2M4 13v-2h16v2M4 19v-2h16v2"),
      sun: base("M12 4V2m0 20v-2M4.93 4.93L3.51 3.51m16.98 16.98l-1.42-1.42M4 12H2m20 0h-2M4.93 19.07L3.51 20.49m16.98-16.98l-1.42 1.42m-6.57 3.07a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"),
      moon: base("M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"),
      loader: base("M21 12a9 9 0 1 1-9-9", 22),
      edit: base("M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"),
    }
  })()

  // Markdown renderer
  function renderMarkdown(md) {
    if (!md) return ""

    // 1) Extract fenced code blocks and display-math blocks and replace with placeholders
    const codeBlocks = []
    const mathBlocks = []
    // display math $$...$$
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
      const idx = mathBlocks.length
      mathBlocks.push({ display: true, tex })
      return `@@MATHBLOCK_${idx}@@`
    })

    md = md.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length
      codeBlocks.push({ lang: lang || "", code })
      return `@@CODEBLOCK_${idx}@@`
    })

    // 2) Process the remaining markdown line-by-line into HTML blocks
    const lines = md.split(/\r?\n/)
    const out = []
    let inList = false

    function closeListIfOpen() {
      if (inList) {
        out.push("</ul>")
        inList = false
      }
    }

    for (let rawLine of lines) {
      const line = rawLine.replace(/\t/g, "    ")

      // Code block placeholder
      const cb = line.match(/^@@CODEBLOCK_(\d+)@@$/)
      if (cb) {
        closeListIfOpen()
        out.push(line) // keep placeholder for later restoration
        continue
      }

      // Headings (# - up to ######)
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
      if (h) {
        closeListIfOpen()
        const level = Math.min(6, h[1].length)
        out.push(`<h${level}>${escapeHtml(h[2].trim())}</h${level}>`)
        continue
      }

      // Unordered list item (-, *, +)
      const li = line.match(/^\s*[-*+]\s+(.*)$/)
      if (li) {
        if (!inList) {
          out.push("<ul>")
          inList = true
        }
        out.push(`<li>${inlineEscapeAndFormat(li[1].trim())}</li>`)
        continue
      }

      // Blank line
      if (line.trim() === "") {
        closeListIfOpen()
        out.push("")
        continue
      }

      // Table row detection (simple GFM table support). Collect contiguous table lines.
      if (/\|/.test(line) && line.trim().startsWith("|")) {
        closeListIfOpen()
        // collect until a non-table line
        const tableLines = [line]
        let nextIndex = lines.indexOf(rawLine) + 1
        while (nextIndex < lines.length && /\|/.test(lines[nextIndex]) && lines[nextIndex].trim().startsWith("|")) {
          tableLines.push(lines[nextIndex].replace(/\t/g, "    "))
          nextIndex++
        }
        // move iterator forward
        for (let k = 0; k < tableLines.length - 1; k++) lines.shift()

        // parse header and rows
        const cols = tableLines[0].split("|").map(s => s.trim()).filter(Boolean)
        const rows = tableLines.slice(1).map(r => r.split("|").map(s => s.trim()).filter(Boolean))
        let tbl = ['<table class="aixt-table">', '<thead><tr>']
        cols.forEach(c => tbl.push(`<th>${escapeHtml(c)}</th>`))
        tbl.push('</tr></thead><tbody>')
        rows.forEach(r => {
          tbl.push('<tr>')
          r.forEach(c => tbl.push(`<td>${inlineEscapeAndFormat(c)}</td>`))
          tbl.push('</tr>')
        })
        tbl.push('</tbody></table>')
        out.push(tbl.join(''))
        continue
      }

      // Paragraph
      out.push(`<p>${inlineEscapeAndFormat(line.trim())}</p>`)
    }

    closeListIfOpen()

    let html = out.join("\n")

    // 3) Restore fenced code blocks and display-math from placeholders
    html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => {
      const cb = codeBlocks[Number(idx)]
      const langClass = cb.lang ? ` class="lang-${escapeHtml(cb.lang)}"` : ""
      return `<pre class="aixt-pre"><code${langClass}>${escapeHtml(cb.code)}</code></pre>`
    })

    html = html.replace(/@@MATHBLOCK_(\d+)@@/g, (_, idx) => {
      const mb = mathBlocks[Number(idx)]
      if (!mb) return ''
      return renderMathBlock(mb.tex, true)
    })

    return html
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  function sanitizeHref(href) {
    if (!href) return "#"
    const s = String(href).trim()
    if (/^javascript:/i.test(s)) return "#"
    return escapeHtml(s)
  }

  // Inline parser: escapes text and replaces inline markdown tokens (code, links, bold, italic)
  function inlineEscapeAndFormat(raw) {
    if (!raw) return ""

    // 1) Extract inline math $...$ (not $$) to placeholders to avoid conflicts
    const mathInline = []
    let text = raw.replace(/\$(?!\$)([^$\n]+?)\$/g, (_, tex) => {
      const id = mathInline.length
      mathInline.push(tex)
      return `@@INLINE_MATH_${id}@@`
    })

    let result = ""
    let lastIndex = 0
    const pattern = /(`[^`]+`)|(\*\*[\s\S]+?\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^\)]+\))/g
    let m
    while ((m = pattern.exec(text)) !== null) {
      const idx = m.index
      if (idx > lastIndex) {
        result += escapeHtml(text.slice(lastIndex, idx))
      }

      const token = m[0]
      if (m[1]) {
        const content = token.slice(1, -1)
        result += `<code class="aixt-code">${escapeHtml(content)}</code>`
      } else if (m[2]) {
        const content = token.slice(2, -2)
        result += `<strong>${escapeHtml(content)}</strong>`
      } else if (m[3]) {
        const content = token.slice(1, -1)
        result += `<em>${escapeHtml(content)}</em>`
      } else if (m[4]) {
        const parts = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/)
        if (parts) {
          const label = parts[1]
          const href = parts[2]
          result += `<a href="${sanitizeHref(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
        } else {
          result += escapeHtml(token)
        }
      } else {
        result += escapeHtml(token)
      }

      lastIndex = idx + token.length
    }

    if (lastIndex < text.length) {
      result += escapeHtml(text.slice(lastIndex))
    }

    // 2) Restore inline math placeholders
    result = result.replace(/@@INLINE_MATH_(\d+)@@/g, (_, id) => {
      const tex = mathInline[Number(id)]
      return renderMathBlock(tex, false)
    })

    return result
  }

  // KaTeX loader + renderer
  let _katexLoaded = false
  let _katexLoading = null
  async function ensureKatexLoaded() {
    if (_katexLoaded) return true
    if (_katexLoading) return _katexLoading

    _katexLoading = new Promise((resolve) => {
      // Try loading KaTeX from extension files first to avoid page CSP blocking external CDNs.
      const localCss = chrome.runtime.getURL('vendor/katex.min.css')
      const localJs = chrome.runtime.getURL('vendor/katex.min.js')

      try {
        const css = document.createElement('link')
        css.rel = 'stylesheet'
        css.href = localCss
        document.head.appendChild(css)
      } catch (e) {
        // continue even if CSS fails
      }

      const s = document.createElement('script')
      s.src = localJs
      s.onload = () => {
        _katexLoaded = !!window.katex
        if (_katexLoaded) return resolve(true)

        // Local file loaded but did not expose KaTeX. Use fallback to avoid CDN attempts.
        console.warn('KaTeX local file loaded but window.katex is not defined. Using fallback renderer.')
        return resolve(false)
      }
      s.onerror = () => {
        // Local load failed (file missing or blocked). Do NOT attempt CDN on pages with strict CSP;
        // instead use the lightweight fallback renderer to avoid additional CSP errors.
        console.warn('KaTeX local file could not be loaded (missing or blocked by CSP). Using fallback renderer.')
        return resolve(false)
      }
      document.head.appendChild(s)
    })

    return _katexLoading
  }

  // No CDN fallback: to avoid CSP violations on pages that block external scripts,
  // the extension prefers loading KaTeX from the extension's `vendor/` folder.
  // If those files are missing or blocked, a safe in-extension fallback will be used.

  function renderMathBlock(tex, displayMode = false) {
    if (window.katex && window.katex.renderToString) {
      try {
        return window.katex.renderToString(tex, { throwOnError: false, displayMode })
      } catch (e) {
        return `<pre class="aixt-pre"><code>${escapeHtml(tex)}</code></pre>`
      }
    }
    // fallback: show raw escaped TeX inside code block
    return `<pre class="aixt-pre"><code>${escapeHtml(tex)}</code></pre>`
  }

  // Create Shadow Root
  const host = document.createElement("div")
  host.id = SHADOW_ID
  host.style.all = "initial"
  const shadow = host.attachShadow({ mode: "open" })
  document.documentElement.appendChild(host)

  const styleEl = document.createElement("style")
  styleEl.textContent = "/* loading styles... */"
  shadow.appendChild(styleEl)

  // Root UI
  const root = document.createElement("div")
  root.className = "aixt-root"
  root.innerHTML = `
    <div class="aixt-bubble" role="button" aria-label="Ask AI" title="Ask AI" style="display: none;">
      <span class="aixt-ico">${Icons.sparkles}</span>
    </div>

    <div class="aixt-dropdown" role="menu" style="display: none;">
      <button class="aixt-menu-item" data-action="summarize">
        <span class="aixt-ico">${Icons.text}</span>
        <span>Summarize</span>
      </button>
      <button class="aixt-menu-item" data-action="explain">
        <span class="aixt-ico">${Icons.info}</span>
        <span>Explain</span>
      </button>
      <button class="aixt-menu-item" data-action="answer">
        <span class="aixt-ico">${Icons.help}</span>
        <span>Answer</span>
      </button>
      <button class="aixt-menu-item" data-action="what">
        <span class="aixt-ico">${Icons.info}</span>
        <span>What is it?</span>
      </button>
      <button class="aixt-menu-item" data-action="custom">
        <span class="aixt-ico">${Icons.edit}</span>
        <span>Custom Question</span>
      </button>
    </div>

    <div class="aixt-panel" role="dialog" aria-modal="true" style="display: none;">
      <div class="aixt-header">
        <div class="aixt-title" id="aixt-title">AI Assistant</div>
        <div class="aixt-actions">
          <button class="aixt-theme" title="Toggle theme" aria-label="Toggle theme">${Icons.sun}</button>
          <button class="aixt-close" title="Close" aria-label="Close">${Icons.x}</button>
        </div>
      </div>

      <div class="aixt-content">
        <div class="aixt-custom-input" style="display: none;">
          <label class="aixt-label">
            Your question
            <input type="text" class="aixt-input" placeholder="e.g., Extract key points..." data-custom-q />
          </label>
          <button class="aixt-primary" data-submit-custom>${Icons.send}<span>Ask</span></button>
        </div>

        <div class="aixt-answer-section" style="display: none;">
          <div class="aixt-answer-toolbar">
            <button class="aixt-secondary" data-back>← Back</button>
            <div class="aixt-model-info" data-model-info></div>
          </div>
          <div class="aixt-answer" data-answer>
            <div class="aixt-empty">
              <span class="aixt-ico aixt-spin">${Icons.loader}</span>
              <span>Thinking...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
  shadow.appendChild(root)

  // Load CSS
  fetch(CSS_URL)
    .then((r) => r.text())
    .then((css) => {
      styleEl.textContent = css
    })
    .catch(() => {
      styleEl.textContent = "/* CSS failed to load */"
    })

  // Elements
  const bubble = root.querySelector(".aixt-bubble")
  const dropdown = root.querySelector(".aixt-dropdown")
  const panel = root.querySelector(".aixt-panel")
  const themeBtn = root.querySelector(".aixt-theme")
  const closeBtn = root.querySelector(".aixt-close")
  const customInput = root.querySelector(".aixt-custom-input")
  const customQ = root.querySelector("[data-custom-q]")
  const submitCustom = root.querySelector("[data-submit-custom]")
  const answerSection = root.querySelector(".aixt-answer-section")
  const answerBox = root.querySelector("[data-answer]")
  const backBtn = root.querySelector("[data-back]")
  const modelInfo = root.querySelector("[data-model-info]")

  // Event listeners
  bubble.addEventListener("click", (e) => {
    e.stopPropagation()
    showDropdown()
  })

  root.querySelectorAll(".aixt-menu-item").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const action = btn.getAttribute("data-action")
      hideDropdown()
      
      if (action === "custom") {
        showCustomInput()
      } else {
        await handleAction(action)
      }
    })
  })

  submitCustom.addEventListener("click", async () => {
    await handleAction("custom", customQ.value.trim())
  })

  customQ.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await handleAction("custom", customQ.value.trim())
    }
  })

  backBtn.addEventListener("click", () => {
    hidePanel()
    hideBubble()
    STATE.selectionText = ""
  })

  themeBtn.addEventListener("click", () => {
    if (STATE.theme === "dark") {
      STATE.theme = "light"
      root.setAttribute("data-theme", "light")
      themeBtn.innerHTML = Icons.sun
    } else {
      STATE.theme = "dark"
      root.setAttribute("data-theme", "dark")
      themeBtn.innerHTML = Icons.moon
    }
  })

  closeBtn.addEventListener("click", () => {
    hidePanel()
    hideBubble()
    STATE.selectionText = ""
  })

  // Click outside to close
  document.addEventListener("click", (e) => {
    if (!shadow.contains(e.target)) {
      hideDropdown()
    }
  })

  // Selection tracking
  document.addEventListener("mouseup", handleSelectionChange)
  document.addEventListener("keyup", (e) => {
    if (e.key === "Shift" || e.key === "Control" || e.key === "Meta") return
    handleSelectionChange()
  })

  // Load GSAP
  loadGSAP()

  function handleSelectionChange() {
    const sel = window.getSelection()
    const text = (sel && sel.toString()) || ""
    
    if (text.trim() && text.trim().length > 0) {
      STATE.selectionText = text.slice(0, MAX_SELECTION_CHARS)
      showBubbleNearSelection()
    } else {
      hideBubble()
      hideDropdown()
    }
  }

  function showBubbleNearSelection() {
    const rect = getSelectionRect()
    if (!rect) return

    // Position bubble near the end (focus) of the selection — typically bottom-right of the caret
    // Fallbacks and viewport clamps ensure the bubble stays visible.
    const offset = 8
    const bubbleSize = 60 // approximate bubble size for basic clamping
    const rawX = (rect.right !== undefined && rect.right !== 0) ? rect.right + offset : rect.left + offset
    const rawY = (rect.bottom !== undefined && rect.bottom !== 0) ? rect.bottom + offset : rect.top - offset

    const viewportX = Math.min(Math.max(rawX, 8), window.innerWidth - bubbleSize)
    const viewportY = Math.min(Math.max(rawY, 8), window.innerHeight - bubbleSize)
    
    bubble.style.position = "fixed"
    bubble.style.left = `${viewportX}px`
    bubble.style.top = `${viewportY}px`
    bubble.style.display = "flex"
    
    if (window.gsap && gsapLoaded) {
      window.gsap.fromTo(bubble, { scale: 0.8, opacity: 0 }, { duration: 0.2, scale: 1, opacity: 1, ease: "back.out(1.7)" })
    }
  }

  function hideBubble() {
    bubble.style.display = "none"
  }

  function showDropdown() {
    const bubbleRect = bubble.getBoundingClientRect()
    dropdown.style.position = "fixed"
    dropdown.style.left = `${bubbleRect.left}px`
    dropdown.style.top = `${bubbleRect.bottom + 8}px`
    dropdown.style.display = "block"
    STATE.showingMenu = true

    if (window.gsap && gsapLoaded) {
      window.gsap.fromTo(dropdown, { y: -10, opacity: 0 }, { duration: 0.2, y: 0, opacity: 1, ease: "power2.out" })
    }
  }

  function hideDropdown() {
    dropdown.style.display = "none"
    STATE.showingMenu = false
  }

  function showCustomInput() {
    panel.style.display = "grid"
    customInput.style.display = "grid"
    answerSection.style.display = "none"
    customQ.value = ""
    customQ.focus()

    if (window.gsap && gsapLoaded) {
      window.gsap.fromTo(panel, { scale: 0.95, opacity: 0 }, { duration: 0.25, scale: 1, opacity: 1, ease: "power2.out" })
    }
  }

  function hidePanel() {
    panel.style.display = "none"
    customInput.style.display = "none"
    answerSection.style.display = "none"
  }

  async function handleAction(action, customQuestion = "") {
    const text = STATE.selectionText.trim()
    if (!text) {
      alert("No text selected")
      return
    }

    // Show panel with answer section
    panel.style.display = "grid"
    customInput.style.display = "none"
    answerSection.style.display = "grid"
    answerBox.innerHTML = `<div class="aixt-empty"><span class="aixt-ico aixt-spin">${Icons.loader}</span><span>Thinking...</span></div>`

    // Get config
    const cfg = await getConfig()
    if (cfg?.config) {
      modelInfo.textContent = `Model: ${cfg.config.model}`
    }

    if (!cfg?.config?.hasToken) {
      answerBox.innerHTML = renderMarkdown("**Missing token**. Please configure your GitHub token in the extension settings.")
      return
    }

    // Build prompt
    const prompt = buildPrompt(action, text, customQuestion)
    const payload = {
      messages: [
        { role: "system", content: "You are a helpful assistant. Keep answers concise and well-structured." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }

    // Send request
    const res = await chrome.runtime.sendMessage({ type: "ai:chat", payload })
    
    if (!res?.ok) {
      // ensure katex is loaded for consistent rendering of math if present in error text
      await ensureKatexLoaded()
      answerBox.innerHTML = renderMarkdown(`**Error:** ${res?.error || "Unknown error"}`)
      return
    }

    // Ensure KaTeX is available (loads from CDN once). We don't fail if KaTeX doesn't load.
    await ensureKatexLoaded()

    const html = renderMarkdown(res.content)
    answerBox.innerHTML = html

    if (window.gsap && gsapLoaded) {
      window.gsap.fromTo(answerBox, { y: 10, opacity: 0 }, { duration: 0.3, y: 0, opacity: 1, ease: "power2.out" })
    }
  }

  function buildPrompt(action, text, customQ) {
    const base = `Selected text:\n"""\n${text}\n"""`
    switch (action) {
      case "what":
        return `${base}\n\nTask: Describe briefly what this is and its purpose. Return clear 3-5 bullet points.`
      case "summarize":
        return `${base}\n\nTask: Summarize concisely with key points and a one-line TL;DR.`
      case "answer":
        return `${base}\n\nTask: If the selection contains a question, answer it directly with reasoning. If not a question, state 'No question found' and summarize instead.`
      case "explain":
        return `${base}\n\nTask: Explain the content step-by-step for a beginner, including simple examples.`
      case "custom":
      default:
        return `${base}\n\nTask: ${customQ || "Provide helpful insights and a brief summary."}`
    }
  }

  function getSelectionRect() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    // Prefer the focus (where the user finished the selection). This respects selection direction
    const focusNode = sel.focusNode
    const focusOffset = sel.focusOffset

    try {
      const r = document.createRange()

      // If focus is a text node, try a collapsed range at the focus. If that yields no rect,
      // try the previous character range to get a visible rect.
      if (focusNode && focusNode.nodeType === Node.TEXT_NODE) {
        r.setStart(focusNode, Math.max(0, focusOffset))
        r.setEnd(focusNode, Math.max(0, focusOffset))
        const collapsedRect = r.getClientRects()[0] || r.getBoundingClientRect()
        if (collapsedRect && (collapsedRect.width || collapsedRect.height)) return collapsedRect

        if (focusOffset > 0) {
          r.setStart(focusNode, focusOffset - 1)
          r.setEnd(focusNode, focusOffset)
          const prevRects = r.getClientRects()
          if (prevRects && prevRects.length) return prevRects[prevRects.length - 1]
        }
      } else if (focusNode) {
        // If focus is an element node, try selecting the child at offset-1 or offset
        const idx = Math.max(0, Math.min((focusOffset || 0) - 1, (focusNode.childNodes || []).length - 1))
        const candidate = focusNode.childNodes && focusNode.childNodes[idx]
        if (candidate) {
          r.selectNodeContents(candidate)
          const rects = r.getClientRects()
          if (rects && rects.length) return rects[rects.length - 1]
        }
      }
    } catch (e) {
      // ignore and fallback
    }

    // Fallback: return the bounding rect of the whole range
    try {
      const range = sel.getRangeAt(0).cloneRange()
      const rect = range.getBoundingClientRect()
      if (rect && (rect.width || rect.height)) return rect
    } catch (e) {
      // ignore
    }

    return null
  }

  async function getConfig() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "ai:getConfig" })
      return res
    } catch {
      return null
    }
  }
})()
