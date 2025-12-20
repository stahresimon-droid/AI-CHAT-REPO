import express from "express";
import cors from "cors";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";

const app = express();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(express.json());

// ====== FRONTEND SERVING (public/index.html) ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ====== LOGGING ======
app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});

// ====== MEMORY (per session) ======
const conversations = {};

// ====== HEALTH CHECK ======
app.get("/healthz", (req, res) => {
  res.send("ok");
});

// ====== LEAD ENDPOINT (SEND EMAIL VIA RESEND) ======
app.post("/lead", async (req, res) => {
  try {
    const { customerId, name, phone, issue, preferredTime, message } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "name och phone krävs" });
    }

    const lead = {
      customerId: customerId || "naprapat-demo",
      name,
      phone,
      issue: issue || null,
      preferredTime: preferredTime || null,
      message: message || null,
      createdAt: new Date().toISOString(),
    };

    console.log("NEW LEAD:", JSON.stringify(lead, null, 2));

    // ✅ mail destination (your test inbox)
    const TO_EMAIL = "stahresimon@gmail.com";

    // If key missing, we still accept lead but warn in logs.
    if (!process.env.RESEND_API_KEY) {
      console.warn("RESEND_API_KEY saknas – mail skickas inte.");
      return res.json({ ok: true, warning: "RESEND_API_KEY missing" });
    }

    // ✅ Use Resend test sender (works without domain verification)
    const { error } = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: [TO_EMAIL],
      subject: `Ny bokningsförfrågan (${lead.customerId})`,
      html: `
        <h2>Ny bokningsförfrågan</h2>
        <p><b>Kund:</b> ${lead.customerId}</p>
        <p><b>Namn:</b> ${lead.name}</p>
        <p><b>Telefon:</b> ${lead.phone}</p>
        <p><b>Besvär:</b> ${lead.issue ?? "-"}</p>
        <p><b>Önskad tid:</b> ${lead.preferredTime ?? "-"}</p>
        <p><b>Meddelande:</b> ${lead.message ?? "-"}</p>
        <p><b>Tid:</b> ${lead.createdAt}</p>
      `,
    });

    if (error) {
      console.error("RESEND ERROR:", error);
      // return 500 so you see it immediately during testing
      return res.status(500).json({ ok: false, error });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Lead-fel" });
  }
});

// ====== CHAT ENDPOINT (NAPRAPAT AI) ======
app.post("/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: "message och sessionId krävs" });
    }

    if (!conversations[sessionId]) {
      conversations[sessionId] = [
        {
          role: "system",
          content: `
Du är en boknings- och kundserviceassistent för en NAPRAPATKLINIK i Sverige.
Ditt enda mål är att hjälpa besökaren att boka tid eller bli kontaktad.

Regler:
- Du pratar svenska, kort, tryggt och professionellt.
- Du antar ALLTID att verksamheten är en naprapatklinik.
- Vanliga besvär: rygg, nacke, axlar, huvudvärk, höft, idrottsskador.
- Om kunden nämner smärta, tid, boka, pris eller behandling → styr direkt mot bokning.
- Fråga i denna ordning och EN fråga i taget:
  1. Namn
  2. Telefonnummer
  3. Vad besväret gäller
  4. När kunden vill komma
- Om kunden frågar om pris: svara enkelt (t.ex. "Nybesök ca 790–990 kr, återbesök ca 690–890 kr") och fråga om de vill boka.
- Du ska ALDRIG fråga om läkare, frisör eller andra yrken.
- När du fått namn + telefon + önskad tid: bekräfta lugnt och säg att kliniken kontaktar kunden inom kort.
- Ge inga medicinska diagnoser – endast generell vägledning.
`,
        },
      ];
    }

    conversations[sessionId].push({ role: "user", content: message });

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: conversations[sessionId],
    });

    const reply =
      response.choices?.[0]?.message?.content || "Jag kunde inte svara just nu.";

    conversations[sessionId].push({ role: "assistant", content: reply });

    return res.json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "AI-fel" });
  }
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servern lyssnar på port ${PORT}`);
});
