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
  InlineStack,
  Box,
  Banner,
  ProgressBar,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreatePlan, PLAN_LIMITS, upgradePlan, remainingCredits, type PlanTier } from "../services/credits.server";

type ActionSuccess = { success: true; message: string };
type ActionError = { error: string };
type ActionData = ActionSuccess | ActionError;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const plan = await getOrCreatePlan(shop);
  const remaining = await remainingCredits(shop);
  const limit = PLAN_LIMITS[plan.tier as PlanTier];

  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(plan.resetAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    )
  );

  return {
    tier: plan.tier,
    creditsUsed: plan.creditsUsed,
    credits: plan.credits,
    remaining,
    limit,
    daysLeft,
    allPlans: PLAN_LIMITS,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const tier = formData.get("tier") as PlanTier;

  if (!tier || !["free", "pro", "business"].includes(tier)) {
    return json({ error: "Invalid plan selected." });
  }

  try {
    await upgradePlan(shop, tier);
    return json({ success: true, message: `Upgraded to ${PLAN_LIMITS[tier].name} plan!` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upgrade plan";
    return json({ error: message });
  }
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();

  const used = data.creditsUsed;
  const progressPercent = Math.round((used / data.credits) * 100);

  const plans = [
    { tier: "free" as const, ...data.allPlans.free, features: ["5 images/month", "Standard quality", "Basic styles"] },
    { tier: "pro" as const, ...data.allPlans.pro, features: ["100 images/month", "HD quality", "All styles & modes", "Priority generation"] },
    { tier: "business" as const, ...data.allPlans.business, features: ["500 images/month", "HD quality", "All styles & modes", "Priority generation", "Bulk generation", "API access"] },
  ];

  const actionData = fetcher.data;
  const isSuccess = actionData && "success" in actionData && actionData.success;
  const isError = actionData && "error" in actionData;

  return (
    <Page>
      <TitleBar title="Settings & Billing" />
      <BlockStack gap="500">
        {isSuccess && actionData && "success" in actionData && (
          <Banner tone="success" title="Plan Updated">
            {actionData.message}
          </Banner>
        )}
        {isError && actionData && "error" in actionData && (
          <Banner tone="critical" title="Error">
            {actionData.error}
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Current Plan
                </Text>
                <Box
                  padding="400"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        {data.limit.name}
                      </Text>
                      <Text as="span" variant="headingMd" fontWeight="bold">
                        {data.limit.price}
                      </Text>
                    </InlineStack>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="span" variant="bodyMd">
                          Usage this month
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {used} / {data.credits} images
                        </Text>
                      </InlineStack>
                      <ProgressBar
                        progress={progressPercent}
                        tone={progressPercent > 80 ? "critical" : "success"}
                      />
                      <Text as="span" variant="bodySm" tone="subdued">
                        {data.remaining} remaining · Resets in {data.daysLeft} days
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Available Plans
              </Text>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                {plans.map((plan) => {
                  const isCurrent = data.tier === plan.tier;
                  return (
                    <Card key={plan.tier}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingMd" fontWeight="bold">
                            {plan.name}
                          </Text>
                          {isCurrent && (
                            <Box
                              padding="100"
                              paddingInlineStart="200"
                              paddingInlineEnd="200"
                              background="bg-fill-success"
                              borderRadius="200"
                            >
                              <Text as="span" variant="bodySm" tone="success">
                                Current
                              </Text>
                            </Box>
                          )}
                        </InlineStack>
                        <Text as="p" variant="heading2xl" fontWeight="bold">
                          {plan.price}
                        </Text>
                        <Box minHeight="180px">
                          <List>
                            {plan.features.map((f) => (
                              <List.Item key={f}>{f}</List.Item>
                            ))}
                          </List>
                        </Box>
                        <fetcher.Form method="POST">
                          <input type="hidden" name="tier" value={plan.tier} />
                          <Button
                            variant={isCurrent ? "secondary" : "primary"}
                            fullWidth
                            submit
                            disabled={isCurrent || fetcher.state === "submitting"}
                            loading={fetcher.state === "submitting" && fetcher.formData?.get("tier") === plan.tier}
                          >
                            {isCurrent ? "Current Plan" : `Switch to ${plan.name}`}
                          </Button>
                        </fetcher.Form>
                      </BlockStack>
                    </Card>
                  );
                })}
              </div>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
