/**
 * Free AI Image Generation via Pollinations.ai
 * No API key required — completely free to use.
 * Docs: https://pollinations.ai/
 */

export interface GenerateImageParams {
  prompt: string;
  width?: number;
  height?: number;
  style?: "vivid" | "natural";
}

export interface GenerateResult {
  url: string;
  revisedPrompt: string;
}

function buildImageUrl(prompt: string, width = 1024, height = 1024): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true`;
}

export async function generateProductImage(
  params: GenerateImageParams
): Promise<GenerateResult> {
  const enhancedPrompt = `Professional e-commerce product photo: ${params.prompt}. Clean commercial lighting, high resolution, suitable for online store product display. White background or lifestyle scene as appropriate. No watermarks, no text overlays.`;

  const width = params.width || 1024;
  const height = params.height || 1024;
  const url = buildImageUrl(enhancedPrompt, width, height);

  return {
    url,
    revisedPrompt: params.prompt,
  };
}

export async function generateLifestyleImage(
  productDescription: string,
  scene: string
): Promise<GenerateResult> {
  const prompt = `Product: ${productDescription}. Scene: ${scene}. Professional e-commerce lifestyle photography, natural lighting, authentic setting.`;
  return generateProductImage({ prompt, style: "natural", width: 1024, height: 1024 });
}

export async function generateBackgroundReplacement(
  productDescription: string,
  background: string
): Promise<GenerateResult> {
  const prompt = `Product: ${productDescription}. Place this product in/on: ${background}. Professional product photography, studio lighting, clean composition.`;
  return generateProductImage({ prompt, style: "vivid", width: 1024, height: 1024 });
}
