import prisma from "../db.server";

export type PlanTier = "free" | "pro" | "business";

export const PLAN_LIMITS: Record<PlanTier, { credits: number; name: string; price: string }> = {
  free: { credits: 5, name: "Free", price: "$0/month" },
  pro: { credits: 100, name: "Pro", price: "$19/month" },
  business: { credits: 500, name: "Business", price: "$49/month" },
};

/**
 * Get or create a plan for a shop
 */
export async function getOrCreatePlan(shop: string) {
  let plan = await prisma.plan.findUnique({ where: { shop } });

  if (!plan) {
    plan = await prisma.plan.create({
      data: {
        shop,
        tier: "free",
        credits: PLAN_LIMITS.free.credits,
        creditsUsed: 0,
        resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
  }

  // Reset credits if past reset date
  if (plan.resetAt < new Date()) {
    const limit = PLAN_LIMITS[plan.tier as PlanTier] || PLAN_LIMITS.free;
    plan = await prisma.plan.update({
      where: { shop },
      data: {
        credits: limit.credits,
        creditsUsed: 0,
        resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return plan;
}

/**
 * Check if shop has remaining credits
 */
export async function hasCredits(shop: string): Promise<boolean> {
  const plan = await getOrCreatePlan(shop);
  return plan.creditsUsed < plan.credits;
}

/**
 * Get remaining credits
 */
export async function remainingCredits(shop: string): Promise<number> {
  const plan = await getOrCreatePlan(shop);
  return Math.max(0, plan.credits - plan.creditsUsed);
}

/**
 * Consume one credit
 */
export async function consumeCredit(shop: string): Promise<boolean> {
  const plan = await getOrCreatePlan(shop);

  if (plan.creditsUsed >= plan.credits) {
    return false;
  }

  await prisma.plan.update({
    where: { shop },
    data: { creditsUsed: plan.creditsUsed + 1 },
  });

  return true;
}

/**
 * Upgrade plan tier
 */
export async function upgradePlan(shop: string, tier: PlanTier) {
  const limit = PLAN_LIMITS[tier];
  if (!limit) throw new Error(`Invalid plan tier: ${tier}`);

  return prisma.plan.update({
    where: { shop },
    data: {
      tier,
      credits: limit.credits,
      creditsUsed: 0,
      resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}
