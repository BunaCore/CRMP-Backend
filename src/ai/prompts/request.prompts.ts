export const REQUEST_PROMPTS = {
  GRAMMAR_FIX: (context: string) => `Fix the grammar, spelling, and phrasing of the following text. Preserve the original meaning. Output ONLY the corrected text. Do not add explanations. Do not reject valid short input.
Text:
${context}`,

  SUMMARIZE: (context: string) => `Provide a short, concise summary of the following text. Do not add excessive explanation or external information. Do not reject valid short input.
Text:
${context}`,

  EXPLAIN: (context: string) => `Explain the following text in clear, simple language. Stay focused strictly on the provided content. Do not drift into unrelated topics. Do not reject valid short input.
Text:
${context}`,

  OUTLINE: (context: string) => `Generate a clean outline from the following text. Return ONLY a list of headings or steps. Do not add intro/outro text. Do not reject valid short input.
Text:
${context}`,
  
  INSERT: (context: string) => `Based on the following context, write the next logical sentence or paragraph. Return ONLY the new text to be inserted. Do not reject valid short input.
Context:
${context}`
};
