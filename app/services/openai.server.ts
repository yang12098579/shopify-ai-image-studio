import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GenerateImageParams {
  prompt: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  style?: "vivid" | "natural";
}

export interface GenerateResult {
  url: string;
  revisedPrompt: string;
}

export async function generateProductImage(
  params: GenerateImageParams
): Promise<GenerateResult> {
  const enhancedPrompt = `Professional e-commerce product photo: ${params.prompt}. 
Clean commercial lighting, high resolution, suitable for online store product display.
White background or lifestyle scene as appropriate. No watermarks, no text overlays.`;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: enhancedPrompt,
    n: 1,
    size: params.size || "1024x1024",
    style: params.style || "natural",
    quality: "standard",
  });

  if (!response.data || response.data.length === 0) {
    throw new Error("No image data returned from OpenAI");
  }

  const imageData = response.data[0];
  if (!imageData?.url) {
    throw new Error("No image URL returned from OpenAI");
  }

  return {
    url: imageData.url,
    revisedPrompt: imageData.revised_prompt || params.prompt,
  };
}

export async function generateLifestyleImage(
  productDescription: string,
  scene: string
): Promise<GenerateResult> {
  const prompt = `Product: ${productDescription}. Scene: ${scene}. 
Professional e-commerce lifestyle photography, natural lighting, authentic setting.`;

  return generateProductImage({ prompt, style: "natural" });
}

export async function generateBackgroundReplacement(
  productDescription: string,
  background: string
): Promise<GenerateResult> {
  const prompt = `Product: ${productDescription}. Place this product in/on: ${background}. 
Professional product photography, studio lighting, clean composition.`;

  return generateProductImage({ prompt, style: "vivid" });
}
