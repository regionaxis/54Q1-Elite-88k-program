
import { GoogleGenAI } from "@google/genai";
import { ProcessedStudent } from "../types";

export const getAIInsights = async (stats: ProcessedStudent[], currentWeek: number) => {
  // Always use the API key exclusively from process.env.API_KEY and initialize with a named parameter.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const statsSummary = stats.map(s => ({
    name: s.name,
    sc: s.totalSC,
    meetings: s.cumulativeEffective,
    targetReached: s.isAchiever
  }));

  const prompt = `
    Based on the following performance data for the "Q1 8.8k Sprint Training Plan" (Week ${currentWeek} of 8), 
    provide a brief (2-3 sentences), professional, and encouraging analysis in Traditional Chinese.
    Target SC: 88,000 per person. Total Meeting Goal: 20 per person.
    
    Data Summary:
    ${JSON.stringify(statsSummary)}
    
    Highlight top performers and give a brief motivational tip for the team.
  `;

  try {
    // Call generateContent with both model name and prompt directly.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    // Access the .text property directly (do not call it as a function).
    return response.text;
  } catch (error) {
    console.error("AI Insights Error:", error);
    return "無法生成 AI 建議。請繼續加油，達成 8.8 萬目標！";
  }
};
