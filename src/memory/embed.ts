import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.embeddings.enabled) {
    throw new Error('Embeddings are disabled. Set EMBEDDINGS_ENABLED=true and provide EMBEDDINGS_API_KEY.');
  }
  if (!config.embeddings.apiKey) {
    throw new Error('EMBEDDINGS_API_KEY is not set.');
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
    dimensions: config.embeddings.dimensions,
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
