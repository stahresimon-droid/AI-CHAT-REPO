import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// enkel minneslagring för konversationer
const conversations = {};

app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});

/**
 * Root route (så du inte får "Cannot GET /")
 */
app.get("/", (req, res) => {
  res.send("API is running ✅  Try /healthz");
});

/**
 * Health check (bra för Render)
 * Testa i webbläsaren: https://din-url/healthz
 */
app.get("/healthz", (req, res) => {
  res.send("ok");
});

/**
 * Lead endpoint (för lead-maskin)
 * Tar emot lead och loggar det (sen kopplar vi mail / sheets)
 */
app.post("/lead", async (req, res) => {
  try {
    const {
      customerId,
      name,
      phone,
      email,
      issue,
      duration,
      painLevel,
      preferredWeek,
      preferredTime,
      message,
    } = req.body;

    // Minimikrav
    if (!name || !phone) {
      return res.status(400).json({ error: "name och phone krävs" });
    }

    const lead = {
      customerId: customerId || "unknown",
      name,
      phone,
      email: email || null,
      issue: issue || null,
      duration: duration || null,
      painLevel: painLevel ?? null,
      preferredWeek: preferredWeek || null,
      preferredTime: preferredTime || null,
      message: message || null,
      createdAt: new Date().toISOString(),
    };

    console.log("NEW LEAD:", JSON.stringify(lead, null, 2));

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Något gick fel med lead." });
  }
});

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
          content:
            "Du är en hjälpsam AI-assistent som svarar kort och tydligt på svenska.",
        },
      ];
    }

    conversations[sessionId].push({ role: "user", content: message });

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: conversations[sessionId],
    });

    const reply = response.choices[0].message.content;
    conversations[sessionId].push({ role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Något gick fel med AI-samtalet." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servern lyssnar på port ${PORT}`);
});
