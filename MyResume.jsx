import { useState, useCallback } from "react";

const WORD_LIMIT = 350;

function countWords(str) {
  return str.trim() === "" ? 0 : str.trim().split(/\s+/).length;
}

async function extractPDFText(file) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = async () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item) => item.str).join(" ") + "\n";
        }
        resolve(text.trim());
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    if (!window.pdfjsLib) {
      document.head.appendChild(script);
    } else {
      script.onload();
    }
  });
}

export default function MyResume() {
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [resumePreview, setResumePreview] = useState("");
  const [jdText, setJdText] = useState("");
  const [fileError, setFileError] = useState("");
  const [jdError, setJdError] = useState("");
  const [screen, setScreen] = useState("idle"); // idle | generating | result | error
  const [result, setResult] = useState("");
  const [genError, setGenError] = useState("");

  const wordCount = countWords(jdText);
  const canGenerate = resumeText && jdText && wordCount <= WORD_LIMIT;

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileError("");
    if (file.type !== "application/pdf") {
      setFileError("Please upload a PDF file only.");
      e.target.value = "";
      return;
    }
    try {
      const text = await extractPDFText(file);
      if (!text) {
        setFileError("No text could be extracted. This PDF may be image-based.");
        e.target.value = "";
        return;
      }
      setResumeText(text);
      setFileName(file.name);
      setResumePreview(text.substring(0, 700) + (text.length > 700 ? "…" : ""));
    } catch {
      setFileError("Could not read this PDF. Please try another file.");
      e.target.value = "";
    }
  }, []);

  const removeFile = () => {
    setResumeText("");
    setFileName("");
    setResumePreview("");
    setFileError("");
  };

  const handleJDChange = (e) => {
    const val = e.target.value;
    setJdText(val);
    const wc = countWords(val);
    setJdError(wc > WORD_LIMIT ? `Job description exceeds ${WORD_LIMIT} words. Please trim it down.` : "");
  };

  const generate = async () => {
    setScreen("generating");

    const prompt = `You are an expert resume writer. Rewrite the candidate's resume to be highly targeted to the job description below.

CANDIDATE'S CURRENT RESUME:
${resumeText}

JOB DESCRIPTION:
${jdText}

INSTRUCTIONS:
- Emphasize skills, experience, and accomplishments most relevant to the job description
- Use keywords and phrases from the job description naturally throughout
- Keep all information truthful — do not invent experience or skills not present in the original
- Use a professional format with clear sections (SUMMARY, EXPERIENCE, SKILLS, EDUCATION)
- Be concise — aim for one page
- Output plain text only, no markdown, no asterisks, no pound signs
- Use ALL CAPS for section headers
- Output the resume text only, nothing else`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }

      const output = data.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      if (!output.trim()) throw new Error("Empty response from API.");

      setResult(output.trim());
      setScreen("result");
    } catch (err) {
      setGenError(err.message || "Unknown error");
      setScreen("error");
    }
  };

  const exportPDF = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>MyResume Export</title>
      <style>
        body { font-family: 'Georgia', serif; font-size: 11pt; line-height: 1.6; padding: 2cm; white-space: pre-wrap; color: #111; }
      </style></head>
      <body>${result.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>
    `);
    win.document.close();
    win.print();
  };

  const resetAll = () => {
    removeFile();
    setJdText("");
    setJdError("");
    setResult("");
    setGenError("");
    setScreen("idle");
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", height: "100%", minHeight: 600, display: "flex", flexDirection: "column", background: "#F2F2F0", borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E5E3", padding: "13px 24px", display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, letterSpacing: "-0.3px", color: "#111" }}>
          My<span style={{ fontStyle: "italic", color: "#1D9E75" }}>Resume</span>
        </span>
        <span style={{ fontSize: 12, color: "#999", fontWeight: 300 }}>
          Upload your resume, paste a job description — get a targeted resume instantly.
        </span>
      </div>

      {/* Three columns */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#E5E5E3" }}>

        {/* LEFT — Resume Upload */}
        <div style={{ background: "#fff", display: "flex", flexDirection: "column" }}>
          <PanelHeader step="Step 1" title="Your resume" />
          <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            {!fileName ? (
              <label style={{ border: "1.5px dashed #CCC", borderRadius: 8, padding: "28px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}
                onMouseOver={e => { e.currentTarget.style.borderColor = "#1D9E75"; e.currentTarget.style.background = "#E8F9F3"; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = "#CCC"; e.currentTarget.style.background = ""; }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5, margin: 0 }}>
                  <strong style={{ color: "#111" }}>Click to upload</strong> your resume<br />PDF format only
                </p>
                <input type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFileChange} />
              </label>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#E8F9F3", border: "1px solid #9FE1CB", borderRadius: 8, padding: "8px 12px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span style={{ fontSize: 12, color: "#085041", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
                  <button onClick={removeFile} style={{ background: "none", border: "none", cursor: "pointer", color: "#0F6E56", padding: 2, display: "flex", alignItems: "center", borderRadius: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <p style={{ fontSize: 11.5, lineHeight: 1.65, color: "#888", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{resumePreview}</p>
                </div>
              </>
            )}
            {fileError && <ErrorMsg>{fileError}</ErrorMsg>}
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #E5E5E3" }}>
            <button
              disabled={!canGenerate}
              onClick={generate}
              style={{ width: "100%", padding: "10px", background: canGenerate ? "#1D9E75" : "#CCC", color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: canGenerate ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "background 0.15s" }}
              onMouseOver={e => { if (canGenerate) e.currentTarget.style.background = "#0F6E56"; }}
              onMouseOut={e => { if (canGenerate) e.currentTarget.style.background = "#1D9E75"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              Generate my resume
            </button>
          </div>
        </div>

        {/* CENTER — Job Description */}
        <div style={{ background: "#fff", display: "flex", flexDirection: "column" }}>
          <PanelHeader step="Step 2" title="Job description" />
          <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={jdText}
              onChange={handleJDChange}
              placeholder="Paste the job description here..."
              style={{ flex: 1, minHeight: 260, resize: "none", border: `1px solid ${jdError ? "#F5C4B3" : "#E5E5E3"}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, color: "#111", background: "#fff", outline: "none" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              {jdError ? <ErrorMsg style={{ flex: 1, margin: 0 }}>{jdError}</ErrorMsg> : <div style={{ flex: 1 }} />}
              <span style={{ fontSize: 11, color: wordCount > WORD_LIMIT ? "#D85A30" : "#999", fontWeight: wordCount > WORD_LIMIT ? 500 : 400, whiteSpace: "nowrap" }}>
                {wordCount} / {WORD_LIMIT} words
              </span>
            </div>
            {jdText && (
              <button onClick={() => { setJdText(""); setJdError(""); }}
                style={{ alignSelf: "flex-start", background: "none", border: "1px solid #DDD", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Result */}
        <div style={{ background: "#fff", display: "flex", flexDirection: "column" }}>
          <PanelHeader step="Step 3" title="Your targeted resume" />
          {screen === "idle" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "32px 20px", textAlign: "center", color: "#999" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
              <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>Your tailored resume will appear here once you upload your resume and paste a job description.</p>
            </div>
          )}
          {screen === "generating" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
              <div style={{ width: 56, height: 56, border: "3px solid #E5E5E3", borderTopColor: "#1D9E75", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontSize: 14, fontWeight: 500, color: "#111", textAlign: "center", lineHeight: 1.5, margin: 0 }}>Sit tight!<br />Your resume is generating.</p>
              <span style={{ fontSize: 12, color: "#999", textAlign: "center" }}>This usually takes 15–30 seconds.</span>
            </div>
          )}
          {screen === "result" && (
            <>
              <textarea
                value={result}
                onChange={e => setResult(e.target.value)}
                spellCheck={false}
                style={{ flex: 1, resize: "none", border: "none", padding: 16, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.7, color: "#111", background: "transparent", outline: "none", minHeight: 200 }}
              />
              <div style={{ padding: "10px 16px", borderTop: "1px solid #E5E5E3", display: "flex", gap: 8 }}>
                <button onClick={exportPDF}
                  style={{ flex: 1, padding: 8, background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                  onMouseOver={e => e.currentTarget.style.background = "#0F6E56"}
                  onMouseOut={e => e.currentTarget.style.background = "#1D9E75"}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export as PDF
                </button>
                <button onClick={resetAll}
                  style={{ padding: "8px 14px", background: "none", color: "#666", border: "1px solid #DDD", borderRadius: 8, fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                  Reset
                </button>
              </div>
            </>
          )}
          {screen === "error" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, gap: 12, alignItems: "flex-start" }}>
              <ErrorMsg>Something went wrong generating your resume. Please try again.</ErrorMsg>
              {genError && <p style={{ fontSize: 11, fontFamily: "monospace", color: "#999", background: "#F7F7F7", padding: "8px 10px", borderRadius: 6, wordBreak: "break-all", margin: 0 }}>{genError}</p>}
              <button onClick={() => setScreen("idle")}
                style={{ padding: "7px 14px", background: "none", color: "#666", border: "1px solid #DDD", borderRadius: 6, fontFamily: "inherit", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { border-color: #1D9E75 !important; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

function PanelHeader({ step, title }) {
  return (
    <div style={{ padding: "13px 16px 10px", borderBottom: "1px solid #E5E5E3" }}>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#AAA", marginBottom: 2 }}>{step}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{title}</div>
    </div>
  );
}

function ErrorMsg({ children, style = {} }) {
  return (
    <div style={{ fontSize: 12, color: "#993C1D", background: "#FAECE7", border: "1px solid #F5C4B3", borderRadius: 7, padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: 6, ...style }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{children}</span>
    </div>
  );
}
