export async function getFinancialInsights(financialData: any, companyName: string, reportType: string) {
  try {
    const response = await fetch("/api/gemini/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ financialData, companyName, reportType }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate insights");
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("Error fetching financial insights:", error);
    throw error;
  }
}

export async function getNarrationSuggestions(voucherData: { type: string; ledgerName: string; amount: number; items?: any[] }) {
  try {
    const response = await fetch("/api/gemini/narration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voucherData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate narration");
    }

    const data = await response.json();
    return data.variations as string[];
  } catch (error) {
    console.error("Error fetching narration suggestions:", error);
    throw error;
  }
}
