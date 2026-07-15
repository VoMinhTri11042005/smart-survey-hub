import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testModel(modelName: string) {
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: "Hello, this is a longer test to see if it 503s.",
    });
    console.log(`Success with ${modelName}`);
    return true;
  } catch (err: any) {
    console.log(`Failed with ${modelName}:`, err?.status || err.message);
    return false;
  }
}

async function runTests() {
  const models = ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-2.0-flash-001'];
  for (const m of models) {
    await testModel(m);
  }
}

runTests();
