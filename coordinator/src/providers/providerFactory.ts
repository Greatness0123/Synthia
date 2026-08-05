/**
 * Factory function to create the appropriate inference provider based on config.
 */

import { type ProviderConfig, type InferenceProvider, type ProviderType } from './types';
import { KaggleProvider } from './kaggleProvider';
import { OpenAICompatProvider } from './openaiCompatProvider';
import { GeminiProvider } from './geminiProvider';

export function createProvider(config: ProviderConfig): InferenceProvider {
  switch (config.type) {
    case 'kaggle':
      return new KaggleProvider(config);

    case 'gemini':
      if (!config.apiKey) throw new Error('Gemini provider requires an API key');
      return new GeminiProvider(config);

    case 'nim':
    case 'openrouter':
    case 'groq':
    case 'qwen':
    case 'cerebras':
    case 'minimax':
    case 'moonshot':
    case 'mistral':
    case 'nvidia':
    case 'xai':
    case 'zai':
    case 'anthropic':
    case 'openai':
    case 'deepseek':
    case 'together':
    case 'fireworks':
    case 'huggingface':
    case 'ollama':
    case 'lmstudio':
    case 'custom':
      return new OpenAICompatProvider(config);

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

/**
 * Get the default base URL for a known provider type.
 */
export function getDefaultEndpoint(type: ProviderType): string {
  switch (type) {
    case 'kaggle':
      return 'http://localhost:8000/infer';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'nim':
    case 'nvidia':
      return 'https://integrate.api.nvidia.com/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'qwen':
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    case 'cerebras':
      return 'https://api.cerebras.ai/v1';
    case 'minimax':
      return 'https://api.minimax.io/v1';
    case 'moonshot':
      return 'https://api.moonshot.ai/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'zai':
      return 'https://api.z.ai/api/paas/v4';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'together':
      return 'https://api.together.xyz/v1';
    case 'fireworks':
      return 'https://api.fireworks.ai/inference/v1';
    case 'huggingface':
      return 'https://api-inference.huggingface.co/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'lmstudio':
      return 'http://localhost:1234/v1';
    case 'custom':
      return '';
    default:
      return '';
  }
}

/**
 * Get the default model for each provider type.
 */
export function getDefaultModel(type: ProviderType): string {
  switch (type) {
    case 'kaggle':
      return 'Qwen2.5-VL-3B-Instruct';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'nim':
    case 'nvidia':
      return 'meta/llama-3.2-90b-vision-instruct';
    case 'openrouter':
      return 'meta-llama/llama-3.2-90b-vision-instruct';
    case 'groq':
      return 'llama-3.2-90b-vision-preview';
    case 'qwen':
      return 'qwen3-vl-plus';
    case 'cerebras':
      return 'gemma-4-31b';
    case 'minimax':
      return 'MiniMax-M3';
    case 'moonshot':
      return 'kimi-k2.6';
    case 'mistral':
      return 'mistral-large-latest';
    case 'xai':
      return 'grok-4.5';
    case 'zai':
      return 'glm-5v-turbo';
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4o';
    case 'deepseek':
      return 'deepseek-chat';
    case 'together':
      return 'Qwen/Qwen2.5-VL-72B-Instruct-Turbo';
    case 'fireworks':
      return 'accounts/fireworks/models/llama-v3p2-90b-vision-instruct';
    case 'huggingface':
      return 'Qwen/Qwen2.5-VL-72B-Instruct';
    case 'ollama':
      return 'llava';
    case 'lmstudio':
      return '';
    case 'custom':
      return '';
    default:
      return '';
  }
}
