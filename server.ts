import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp as initAdminApp, getApps as getAdminApps } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.post("/api/gemini/insights", async (req, res) => {
    try {
      const { financialData, companyName, reportType } = req.body;
      
      const prompt = `You are a professional financial analyst. 
      Analyze the following financial data for the company "${companyName}" from their ${reportType} report.
      Data: ${JSON.stringify(financialData)}
      
      Please provide:
      1. A brief executive summary.
      2. Key strengths or positive trends.
      3. Potential areas of concern or risks.
      4. actionable recommendations.
      
      Keep the response professional, concise, and formatted in Markdown. 
      Use clear headings and bullet points.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error / Quota Exhausted:", error?.message || error);
      // Fallback response for quota exhaustion
      res.json({ 
        text: `### Financial Summary for ${req.body.companyName || 'Company'}\n\n* **Executive Summary**: The financial reports indicate stable ongoing business operations with active ledger entries.\n* **Strengths**: Consistent transaction logging and balanced books.\n* **Recommendations**: Review outstanding receivables and monitor cash flow regularly.\n\n*(Note: AI quota limit reached, showing standard professional summary)*` 
      });
    }
  });

  app.post("/api/gemini/narration", async (req, res) => {
    try {
      const { type, ledgerName, amount, items } = req.body;
      
      const prompt = `Generate a professional accounting narration for the following ${type} voucher.
      Party/Ledger: ${ledgerName}
      Amount: ${amount}
      ${items ? `Items: ${JSON.stringify(items)}` : ""}
      
      Provide 3 variations:
      1. Short and professional
      2. Detailed with terms (e.g. Being...)
      3. Modern and concise
      
      Format the response as a JSON object: { "variations": ["...", "...", "..."] }`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      res.json(JSON.parse(response.text));
    } catch (error: any) {
      console.error("Gemini Narration Error / Quota Exhausted:", error?.message || error);
      // Fallback response for quota exhaustion
      res.json({
        variations: [
          `Being amount paid/received towards ${req.body.ledgerName || 'transaction'}`,
          `Being payment/receipt processed against bill reference for amount ${req.body.amount || 0}`,
          `Being transaction recorded for ${req.body.type || 'Voucher'}`
        ]
      });
    }
  });

  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      const { uid, email } = req.body;
      if (!uid && !email) {
        return res.status(400).json({ error: "Missing user UID or email" });
      }

      // Initialize firebase-admin if not already initialized
      if (getAdminApps().length === 0) {
        initAdminApp({
          projectId: "apt-memento-485612-d6",
        });
      }

      const authAdmin = getAdminAuth();

      if (uid) {
        // Try deleting user by UID first
        try {
          await authAdmin.deleteUser(uid);
          console.log(`Successfully deleted user UID: ${uid} from Auth`);
        } catch (authError: any) {
          console.warn(`Auth delete failed for UID ${uid}, trying email:`, authError.message);
          if (email) {
            const userRecord = await authAdmin.getUserByEmail(email);
            await authAdmin.deleteUser(userRecord.uid);
            console.log(`Successfully deleted user with email: ${email} from Auth`);
          } else {
            throw authError;
          }
        }
      } else if (email) {
        // Delete by email directly
        const userRecord = await authAdmin.getUserByEmail(email);
        await authAdmin.deleteUser(userRecord.uid);
        console.log(`Successfully deleted user with email: ${email} after looking up UID: ${userRecord.uid}`);
      }

      res.json({ success: true, message: "User deleted from Firebase Auth successfully." });
    } catch (error: any) {
      console.error("Error in delete-user endpoint:", error);
      res.status(500).json({ error: error.message || "Failed to delete user from Auth" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
