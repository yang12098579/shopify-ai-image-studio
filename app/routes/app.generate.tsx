import { useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  Select,
  InlineStack,
  Banner,
  Box,
  Spinner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  generateProductImage,
  generateLifestyleImage,
  generateBackgroundReplacement,
} from "../services/openai.server";
import { consumeCredit, hasCredits, remainingCredits } from "../services/credits.server";
import prisma from "../db.server";

type ActionSuccess = { success: true; imageUrl: string; revisedPrompt: string; remaining: number };
type ActionError = { error: string };

type ActionData = ActionSuccess | ActionError;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const response = await admin.graphql(
    `#graphql
    query GetProducts {
      products(first: 20, reverse: true) {
        edges {
          node {
            id
            title
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }`
  );
  const productsData = await response.json();
  const products =
    productsData.data?.products.edges.map(
      (edge: { node: { id: string; title: string; featuredImage: { url: string; altText: string } | null } }) => ({
        id: edge.node.id,
        title: edge.node.title,
        imageUrl: edge.node.featuredImage?.url || null,
      })
    ) || [];

  const remaining = await remainingCredits(shop);

  return { products, remaining };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const hasCredit = await hasCredits(shop);
  if (!hasCredit) {
    return json({ error: "No credits remaining. Please upgrade your plan." });
  }

  const formData = await request.formData();
  const prompt = formData.get("prompt") as string;
  const mode = formData.get("mode") as string;
  const style = formData.get("style") as string;
  const productTitle = formData.get("productTitle") as string;
  const productId = formData.get("productId") as string;

  if (!prompt || prompt.trim().length < 3) {
    return json({ error: "Please enter a description (at least 3 characters)." });
  }

  try {
    let result;
    switch (mode) {
      case "lifestyle":
        result = await generateLifestyleImage(productTitle || "product", prompt);
        break;
      case "background":
        result = await generateBackgroundReplacement(productTitle || "product", prompt);
        break;
      default:
        result = await generateProductImage({
          prompt: `${productTitle ? `Product "${productTitle}": ` : ""}${prompt}`,
          style: (style as "vivid" | "natural") || "natural",
        });
    }

    await prisma.imageGeneration.create({
      data: {
        shop,
        prompt: prompt.trim(),
        style: style || "natural",
        resultUrl: result.url,
        productId: productId || null,
        productTitle: productTitle || null,
        status: "completed",
      },
    });

    await consumeCredit(shop);
    const remaining = await remainingCredits(shop);

    return json({
      success: true,
      imageUrl: result.url,
      revisedPrompt: result.revisedPrompt,
      remaining,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    return json({ error: message });
  }
};

export default function Generate() {
  const { products, remaining: initialRemaining } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("standard");
  const [style, setStyle] = useState("natural");
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");

  const isGenerating = fetcher.state === "submitting";
  const actionData = fetcher.data;

  const isSuccess = actionData && "success" in actionData && actionData.success;
  const isError = actionData && "error" in actionData;

  const imageUrl = isSuccess ? actionData.imageUrl : null;
  const errorMessage = isError ? actionData.error : null;
  const remaining = (isSuccess ? actionData.remaining : undefined) ?? initialRemaining;

  const handleGenerate = useCallback(() => {
    const selectedProduct = products.find((p: { id: string; title: string }) => p.id === productId);
    const title = selectedProduct?.title || productTitle;

    fetcher.submit(
      {
        prompt,
        mode,
        style,
        productId: productId || "",
        productTitle: title,
      },
      { method: "POST" }
    );
  }, [prompt, mode, style, productId, productTitle, fetcher, products]);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai-product-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(imageUrl, "_blank");
    }
  }, [imageUrl]);

  const modeOptions = [
    { label: "Standard Product Photo", value: "standard" },
    { label: "Lifestyle Scene", value: "lifestyle" },
    { label: "Background Replacement", value: "background" },
  ];

  const styleOptions = [
    { label: "Natural & Realistic", value: "natural" },
    { label: "Vivid & Bold", value: "vivid" },
  ];

  const productOptions = [
    { label: "None (describe manually)", value: "" },
    ...products.map((p: { id: string; title: string }) => ({
      label: p.title,
      value: p.id,
    })),
  ];

  return (
    <Page>
      <TitleBar title="AI Image Generator">
        <Text as="span" variant="bodyMd" tone="subdued">
          {remaining} credits remaining
        </Text>
      </TitleBar>
      <BlockStack gap="500">
        {errorMessage && (
          <Banner tone="critical" title="Generation Failed">
            {errorMessage}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Create AI Product Image
                </Text>

                <Select
                  label="Select Product (optional)"
                  options={productOptions}
                  value={productId}
                  onChange={(val) => {
                    setProductId(val);
                    const p = products.find((p: { id: string; title: string }) => p.id === val);
                    setProductTitle(p?.title || "");
                  }}
                  disabled={isGenerating}
                />

                {!productId && (
                  <TextField
                    label="Product Name (optional)"
                    value={productTitle}
                    onChange={setProductTitle}
                    placeholder="e.g., Leather Handbag"
                    autoComplete="off"
                    disabled={isGenerating}
                  />
                )}

                <Select
                  label="Generation Mode"
                  options={modeOptions}
                  value={mode}
                  onChange={setMode}
                  disabled={isGenerating}
                />

                {mode === "standard" && (
                  <Select
                    label="Image Style"
                    options={styleOptions}
                    value={style}
                    onChange={setStyle}
                    disabled={isGenerating}
                  />
                )}

                <TextField
                  label={
                    mode === "background"
                      ? "Describe the background/scene"
                      : mode === "lifestyle"
                      ? "Describe the lifestyle scene"
                      : "Describe the product image you want"
                  }
                  value={prompt}
                  onChange={setPrompt}
                  placeholder={
                    mode === "background"
                      ? "e.g., on a marble countertop with natural sunlight"
                      : mode === "lifestyle"
                      ? "e.g., a model wearing the jacket walking in a city park"
                      : "e.g., floating in center on pure white background, front view"
                  }
                  multiline={3}
                  autoComplete="off"
                  disabled={isGenerating}
                />

                <InlineStack gap="200" align="end">
                  <Button
                    variant="primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || prompt.trim().length < 3 || remaining <= 0}
                    loading={isGenerating}
                  >
                    {isGenerating ? "Generating..." : "Generate Image"}
                  </Button>
                </InlineStack>

                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      Tips for best results
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Be specific about angles: &quot;front view&quot;, &quot;45-degree angle&quot;, &quot;top-down&quot;
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Describe lighting: &quot;soft studio lighting&quot;, &quot;natural sunlight&quot;, &quot;dramatic shadow&quot;
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Include setting: &quot;on white background&quot;, &quot;in a modern kitchen&quot;, &quot;outdoor garden&quot;
                    </Text>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Generated Image
                </Text>

                {isGenerating ? (
                  <Box padding="800">
                    <BlockStack gap="400" align="center">
                      <Spinner size="large" />
                      <Text as="p" variant="bodyMd" tone="subdued">
                        AI is creating your image...
                      </Text>
                    </BlockStack>
                  </Box>
                ) : imageUrl ? (
                  <BlockStack gap="400">
                    <Box
                      borderRadius="200"
                      overflowX="hidden"
                      background="bg-surface-secondary"
                    >
                      <img
                        src={imageUrl}
                        alt={prompt}
                        style={{
                          width: "100%",
                          height: "auto",
                          display: "block",
                        }}
                      />
                    </Box>
                    {isSuccess && actionData.revisedPrompt && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        AI interpretation: {actionData.revisedPrompt}
                      </Text>
                    )}
                    <InlineStack gap="200">
                      <Button onClick={handleDownload}>Download Image</Button>
                      <Button url={imageUrl} external>
                        Open Full Size
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <Box padding="800">
                    <BlockStack gap="400" align="center">
                      <Text as="p" variant="bodyLg" tone="subdued">
                        Describe your product image and click Generate
                      </Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
