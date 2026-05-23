import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { supabase } from "./supabase";

const DEFAULT_ENTITLEMENT_ID = "prime";
const DEFAULT_OFFERING_ID = "default";
const PREGNANCY_ENTITLEMENT_ID = "pregnancy";
const PREGNANCY_OFFERING_ID = "pregnancy";

let configuredAppUserId = null;
let isConfigured = false;

function getRevenueCatApiKey() {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || "";
  }

  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || "";
  }

  return "";
}

function getEntitlementId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || DEFAULT_ENTITLEMENT_ID;
}

function getOfferingId() {
  return process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID || DEFAULT_OFFERING_ID;
}

export async function getCurrentSupabaseUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user || null;
}

export async function ensurePurchasesConfigured(appUserId = null) {
  const apiKey = getRevenueCatApiKey();

  if (!apiKey || (Platform.OS !== "ios" && Platform.OS !== "android")) {
    return { configured: false, reason: "missing-api-key" };
  }

  if (!isConfigured) {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({
      apiKey,
      appUserID: appUserId || undefined,
    });

    isConfigured = true;
    configuredAppUserId = appUserId || null;

    return { configured: true };
  }

  if (appUserId && configuredAppUserId !== appUserId) {
    await Purchases.logIn(appUserId);
    configuredAppUserId = appUserId;
  }

  return { configured: true };
}

export async function resetPurchasesIdentity() {
  if (!isConfigured) {
    configuredAppUserId = null;
    return;
  }

  try {
    if (configuredAppUserId) {
      await Purchases.logOut();
    }
  } catch (error) {
    console.log("RevenueCat logout error:", error);
  } finally {
    configuredAppUserId = null;
  }
}

function hasActiveEntitlement(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[getEntitlementId()]);
}

async function writePremiumStatusToProfile(userId, isPremium) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        is_premium: isPremium,
      },
      { onConflict: "id" }
    );

  if (error) {
    throw error;
  }
}

export async function syncPremiumStatusFromPurchases() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    return { isPremium: false, source: "no-user" };
  }

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) {
    return { isPremium: false, source: setup.reason };
  }

  const customerInfo = await Purchases.getCustomerInfo();
  const isPremium = hasActiveEntitlement(customerInfo);

  await writePremiumStatusToProfile(user.id, isPremium);

  return {
    isPremium,
    customerInfo,
    source: "revenuecat",
  };
}

export async function getPremiumOfferings() {
  const user = await getCurrentSupabaseUser();
  const setup = await ensurePurchasesConfigured(user?.id || null);

  if (!setup.configured) {
    return {
      configured: false,
      availablePackage: null,
      offering: null,
    };
  }

  const offerings = await Purchases.getOfferings();
  const preferredOffering = offerings.all?.[getOfferingId()] || offerings.current || null;
  const availablePackage =
    preferredOffering?.availablePackages?.[0] || null;

  return {
    configured: true,
    offering: preferredOffering,
    availablePackage,
  };
}

export async function purchasePrimePackage(packageToPurchase) {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    throw new Error("user-not-found");
  }

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) {
    throw new Error("revenuecat-not-configured");
  }

  const purchaseResult = await Purchases.purchasePackage(packageToPurchase);
  const isPremium = hasActiveEntitlement(purchaseResult.customerInfo);

  await writePremiumStatusToProfile(user.id, isPremium);

  return {
    isPremium,
    customerInfo: purchaseResult.customerInfo,
  };
}

function hasActivePregnancyEntitlement(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[PREGNANCY_ENTITLEMENT_ID]);
}

async function writePregnancyStatusToProfile(userId, hasSub) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, has_pregnancy_subscription: hasSub }, { onConflict: "id" });
  if (error) throw error;
}

export async function getPregnancyOfferings() {
  try {
    const user = await getCurrentSupabaseUser();
    const setup = await ensurePurchasesConfigured(user?.id || null);

    if (!setup.configured) {
      return { configured: false, availablePackage: null, offering: null };
    }

    const offerings = await Purchases.getOfferings();
    const offering = offerings.all?.[PREGNANCY_OFFERING_ID] || null;
    const availablePackage = offering?.availablePackages?.[0] || null;

    return { configured: true, offering, availablePackage };
  } catch {
    return { configured: false, availablePackage: null, offering: null };
  }
}

export async function purchasePregnancyPackage(packageToPurchase) {
  const user = await getCurrentSupabaseUser();
  if (!user) throw new Error("user-not-found");

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) throw new Error("revenuecat-not-configured");

  const purchaseResult = await Purchases.purchasePackage(packageToPurchase);
  const hasSub = hasActivePregnancyEntitlement(purchaseResult.customerInfo);

  await writePregnancyStatusToProfile(user.id, hasSub);

  return { hasSubscription: hasSub, customerInfo: purchaseResult.customerInfo };
}

export async function checkPregnancySubscriptionStatus() {
  const user = await getCurrentSupabaseUser();
  if (!user) return { hasSubscription: false, source: "no-user" };

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) return { hasSubscription: false, source: setup.reason };

  const customerInfo = await Purchases.getCustomerInfo();
  const hasSub = hasActivePregnancyEntitlement(customerInfo);

  await writePregnancyStatusToProfile(user.id, hasSub);

  return { hasSubscription: hasSub, customerInfo, source: "revenuecat" };
}

export async function restorePregnancyPurchases() {
  const user = await getCurrentSupabaseUser();
  if (!user) throw new Error("user-not-found");

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) throw new Error("revenuecat-not-configured");

  const customerInfo = await Purchases.restorePurchases();
  const hasSub = hasActivePregnancyEntitlement(customerInfo);

  await writePregnancyStatusToProfile(user.id, hasSub);

  return { hasSubscription: hasSub, customerInfo };
}

export async function restorePrimePurchases() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    throw new Error("user-not-found");
  }

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) {
    throw new Error("revenuecat-not-configured");
  }

  const customerInfo = await Purchases.restorePurchases();
  const isPremium = hasActiveEntitlement(customerInfo);

  await writePremiumStatusToProfile(user.id, isPremium);

  return {
    isPremium,
    customerInfo,
  };
}
