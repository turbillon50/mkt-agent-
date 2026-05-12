import OpenAI from 'openai';
import { config } from '../config.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.embeddings.apiKey) {
    throw new Error('OPENAI_API_KEY is not set (required for embeddings).');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: config.embeddings.apiKey,
      baseURL: config.embeddings.baseUrl,
    });
  }
  return client;
}

export async function embed(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: config.embeddings.model,
    input: text,
  });
  const vec = res.data[0]?.embedding;
  if (!vec) throw new Error('Embedding API returned no vector.');
  return vec;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: config.embeddings.model,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}
