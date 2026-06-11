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
  ProgressBar,
  Banner,
  Link,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreatePlan, PLAN_LIMITS, remainingCredits, type PlanTier } from "../services/credits.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const plan = await getOrCreatePlan(shop);
  const remaining = await remainingCredits(shop);
  const limit = PLAN_LIMITS[plan.tier as PlanTier];

  const totalGenerations = await prisma.imageGeneration.count({
    where: { shop },
  });

  const thisMonthGenerations = await prisma.imageGeneration.count({
    where: {
      shop,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const recentGenerations = await prisma.imageGeneration.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  return {
    plan,
    remaining,
    limit,
    totalGenerations,
    thisMonthGenerations,
    recentGenerations,
  };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const used = data.plan.credits - data.remaining;
  const progressPercent = Math.round((used / data.plan.credits) * 100);
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(data.plan.resetAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    )
  );

  return (
    <Page>
      <TitleBar title="AI Product Image Studio">
        <Link url="/app/generate">
          <Button variant="primary">Generate New Image</Button>
        </Link>
      </TitleBar>
      <BlockStack gap="500">
        {data.remaining <= 2 && data.plan.tier === "free" && (
          <Banner tone="warning" title="Running low on credits">
            You have {data.remaining} free generation{data.remaining !== 1 ? "s" : ""} left this month.{" "}
            <Link url="/app/settings">Upgrade to Pro</Link> for 100 generations/month.
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Credits Usage
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodyMd" tone="subdued">
                        {data.limit.name} Plan ({data.limit.price})
                      </Text>
                      <Text as="span" variant="bodyMd" fontWeight="bold">
                        {used} / {data.plan.credits} used
                      </Text>
                    </InlineStack>
                    <ProgressBar
                      progress={progressPercent}
                      tone={progressPercent > 80 ? "critical" : "success"}
                    />
                    <Text as="span" variant="bodySm" tone="subdued">
                      {data.remaining} remaining · Resets in {daysLeft} days
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Quick Stats
                  </Text>
                  <InlineStack gap="400" wrap>
                    <Box minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="h3" variant="heading2xl" fontWeight="bold">
                          {data.totalGenerations}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Total Generations
                        </Text>
                      </BlockStack>
                    </Box>
                    <Box minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="h3" variant="heading2xl" fontWeight="bold">
                          {data.thisMonthGenerations}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          This Month
                        </Text>
                      </BlockStack>
                    </Box>
                    <Box minWidth="150px">
                      <BlockStack gap="100">
                        <Text as="h3" variant="heading2xl" fontWeight="bold">
                          {data.remaining}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Credits Left
                        </Text>
                      </BlockStack>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Recent Generations
                </Text>
                {data.recentGenerations.length === 0 ? (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No images generated yet. Start by creating your first AI product image!
                  </Text>
                ) : (
                  <BlockStack gap="300">
                    {data.recentGenerations.map((gen) => (
                      <Box key={gen.id}>
                        <InlineStack gap="300" align="start">
                          <Box width="60px" minHeight="60px" overflowX="hidden" borderRadius="200">
                            <img
                              src={gen.resultUrl}
                              alt={gen.prompt}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          </Box>
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" fontWeight="bold" truncate>
                              {gen.productTitle || "Custom Image"}
                            </Text>
                            <Text as="p" variant="bodyXs" tone="subdued" truncate>
                              {gen.prompt}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
