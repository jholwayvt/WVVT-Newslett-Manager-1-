
import { GoogleGenAI } from "@google/genai";

// Ensure process.env.API_KEY is available in your environment.
// For this example, it's assumed to be pre-configured.
if (!process.env.API_KEY) {
  console.warn("API_KEY environment variable not set. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateNewsletterContent = async (prompt: string): Promise<string> => {
  if (!process.env.API_KEY) {
    // Simulate a delay and return mock data if API key is not set
    await new Promise(resolve => setTimeout(resolve, 1500));
    return `<h2>Mock AI-Generated Content</h2><p>This is placeholder content because the API key is not configured. With a valid key, Gemini would generate content based on your prompt: <em>"${prompt}"</em></p><p>Here's a sample list:</p><ul><li>Feature 1</li><li>Feature 2</li><li>Special Offer</li></ul>`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a compelling HTML newsletter body based on the following prompt. The output should be only the HTML content, ready to be embedded. Do not include \`<html>\`, \`<head>\`, or \`<body>\` tags. Use standard HTML tags like <h1>, <h2>, <p>, <ul>, <li>, <a>, and <strong>. Prompt: "${prompt}"`,
    });

    const text = response.text;
    if (text) {
      // Basic cleanup to remove markdown code blocks if Gemini includes them
      return text.replace(/```html/g, '').replace(/```/g, '').trim();
    }
    return '';
  } catch (error) {
    console.error("Error generating content with Gemini:", error);
    throw new Error("Failed to generate content. Please check your API key and connection.");
  }
};
