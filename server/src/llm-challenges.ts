// LLM-powered dynamic SATs challenge generation
// Uses NVIDIA API to create questions based on collected letters

import { SATS_CATEGORIES } from '@asteroids/shared/sats-words'

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || ''
const NVIDIA_MODEL = 'qwen/qwen3.5-397b-a17b'  // Good for educational content

export interface LLMChallenge {
  sentence: string
  answer: string
  category: string
  hint: string
}

/**
 * Generate a dynamic SATs challenge using LLM
 * @param collectedLetters - Letters the player has collected
 * @param difficulty - 'easy' | 'medium' | 'hard'
 */
export async function generateLLMChallenge(
  collectedLetters: string[],
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): Promise<LLMChallenge | null> {
  try {
    // Get unique letters and limit to reasonable amount
    const uniqueLetters = [...new Set(collectedLetters)].slice(0, 10)
    
    if (uniqueLetters.length < 3) {
      // Not enough letters, use fallback
      return getFallbackChallenge()
    }

    const prompt = buildPrompt(uniqueLetters, difficulty)
    
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an educational assistant creating Year 6 SATs spelling questions for UK students aged 10-11. Generate age-appropriate questions with clear sentences.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300,
        top_p: 0.9,
      }),
    })

    if (!response.ok) {
      console.error('[LLM] API error:', response.status, response.statusText)
      return getFallbackChallenge()
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      console.error('[LLM] No content in response')
      return getFallbackChallenge()
    }

    return parseLLMResponse(content, uniqueLetters)
  } catch (error) {
    console.error('[LLM] Generation failed:', error)
    return getFallbackChallenge()
  }
}

/**
 * Build the prompt for LLM
 */
function buildPrompt(letters: string[], difficulty: string): string {
  const categories = Object.keys(SATS_CATEGORIES).join(', ')
  
  return `Generate a Year 6 SATs spelling question for UK students (age 10-11).

Use these letters in your answer word: ${letters.join(', ')}

Requirements:
1. The answer word must use at least 3 of the provided letters
2. The word should be appropriate for Year 6 level
3. Create a sentence with a blank (_____) for the word
4. Choose a category from: ${categories}
5. Provide a helpful hint

Respond ONLY with valid JSON in this exact format:
{
  "sentence": "The _____ was very tall.",
  "answer": "building",
  "category": "wordFamilies",
  "hint": "Something that was constructed"
}

Difficulty: ${difficulty}
Make the sentence engaging and age-appropriate.`
}

/**
 * Parse LLM response into challenge object
 */
function parseLLMResponse(content: string, letters: string[]): LLMChallenge | null {
  try {
    // Extract JSON from response (may have markdown formatting)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[LLM] No JSON found in response')
      return getFallbackChallenge()
    }

    const parsed = JSON.parse(jsonMatch[0])
    
    // Validate required fields
    if (!parsed.sentence || !parsed.answer || !parsed.category || !parsed.hint) {
      console.error('[LLM] Missing required fields')
      return getFallbackChallenge()
    }

    // Validate answer uses provided letters
    const answerLetters = new Set(parsed.answer.toLowerCase())
    const providedLetters = new Set(letters.map(l => l.toLowerCase()))
    const usedLetters = [...answerLetters].filter(l => providedLetters.has(l))
    
    if (usedLetters.length < 3) {
      console.log('[LLM] Answer does not use enough provided letters')
      // Still accept it, but log for monitoring
    }

    return {
      sentence: parsed.sentence,
      answer: parsed.answer,
      category: parsed.category,
      hint: parsed.hint,
    }
  } catch (error) {
    console.error('[LLM] Parse error:', error)
    return getFallbackChallenge()
  }
}

/**
 * Get fallback challenge from static database
 */
function getFallbackChallenge(): LLMChallenge {
  const { SATS_CHALLENGES } = require('@asteroids/shared/sats-words')
  const categories = Object.keys(SATS_CATEGORIES)
  const randomCategory = categories[Math.floor(Math.random() * categories.length)]
  const categoryData = SATS_CHALLENGES.find((c: any) => c.category === randomCategory)
  
  if (!categoryData || !categoryData.sentences.length) {
    // Ultimate fallback
    return {
      sentence: "The _____ was very interesting.",
      answer: "story",
      category: "commonExceptions",
      hint: "A tale or narrative",
    }
  }
  
  const randomSentence = categoryData.sentences[Math.floor(Math.random() * categoryData.sentences.length)]
  return {
    sentence: randomSentence.text,
    answer: randomSentence.answer,
    category: randomCategory,
    hint: randomSentence.hint,
  }
}

/**
 * Cache for generated challenges (prevent duplicate API calls)
 */
const challengeCache = new Map<string, LLMChallenge>()

/**
 * Get or generate challenge with caching
 */
export async function getCachedChallenge(
  collectedLetters: string[],
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
): Promise<LLMChallenge> {
  // Create cache key from sorted letters
  const cacheKey = [...collectedLetters].sort().join('') + ':' + difficulty
  
  // Check cache (5 minute expiry could be added)
  const cached = challengeCache.get(cacheKey)
  if (cached) {
    return cached
  }
  
  // Generate new challenge
  const challenge = await generateLLMChallenge(collectedLetters, difficulty) || getFallbackChallenge()
  
  // Cache it
  challengeCache.set(cacheKey, challenge)
  
  // Limit cache size
  if (challengeCache.size > 50) {
    const firstKey = challengeCache.keys().next().value
    if (firstKey) challengeCache.delete(firstKey)
  }
  
  return challenge
}
