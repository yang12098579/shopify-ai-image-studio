import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  Box,
  Button,
  EmptyState,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const generations = await prisma.imageGeneration.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return { generations };
};

export default function History() {
  const { generations } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Generation History" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            {generations.length === 0 ? (
              <Card>
                <EmptyState
                  heading="No images generated yet"
                  image=""
                  action={{
                    content: "Create your first AI image",
                    url: "/app/generate",
                  }}
                >
                  Start generating professional product images with AI.
                </EmptyState>
              </Card>
            ) : (
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Recent Generations ({generations.length})
                </Text>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {generations.map((gen) => (
                    <div key={gen.id}>
                      <Card>
                        <Box
                          padding="0"
                          overflowX="hidden"
                          background="bg-surface-secondary"
                        >
                          <a href={gen.resultUrl} target="_blank" rel="noreferrer">
                            <img
                              src={gen.resultUrl}
                              alt={gen.prompt}
                              style={{
                                width: "100%",
                                aspectRatio: "1",
                                objectFit: "cover",
                              }}
                            />
                          </a>
                        </Box>
                        <Box padding="300">
                          <BlockStack gap="200">
                            <InlineStack gap="200" wrap>
                              {gen.productTitle && (
                                <Badge tone="info">{gen.productTitle}</Badge>
                              )}
                              {gen.style && (
                                <Badge tone="success">{gen.style}</Badge>
                              )}
                            </InlineStack>
                            <Text as="p" variant="bodySm" truncate>
                              {gen.prompt}
                            </Text>
                            <InlineStack gap="200" align="space-between">
                              <Text as="span" variant="bodyXs" tone="subdued">
                                {new Date(gen.createdAt).toLocaleDateString()}
                              </Text>
                              <Button
                                variant="plain"
                                size="slim"
                                url={gen.resultUrl}
                                external
                              >
                                View
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>
                  ))}
                </div>
              </BlockStack>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
