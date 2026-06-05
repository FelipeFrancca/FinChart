
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function listModels() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_AI_API_KEY not found in environment variables');
        return;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data: any = await response.json();

        if (data.error) {
            console.error('Error listing models:', data.error);
            return;
        }

        console.log('Available Gemini Models:');
        if (data.models) {
            const geminiModels = data.models.filter((m: any) => m.name.toLowerCase().includes('gemini'));

            if (geminiModels.length === 0) {
                console.log('No models found with "gemini" in the name.');
                console.log('All available models:', data.models.map((m: any) => m.name).join(', '));
            } else {
                geminiModels.forEach((model: any) => {
                    console.log(`- ${model.name}`);
                });
            }
        } else {
            console.log('No models found or unexpected response format:', data);
        }

    } catch (error) {
        console.error('Failed to list models:', error);
    }
}

listModels();
