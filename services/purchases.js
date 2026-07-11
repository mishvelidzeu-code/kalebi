import { Linking, Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { logMetaPregnancyPurchase, logMetaPrimePurchase } from "./metaAppEvents";
import { supabase } from "./supabase";

const DEFAULT_ENTITLEMENT_ID = "prime";
const DEFAULT_OFFERING_ID = "default";
const PREGNANCY_ENTITLEMENT_ID = "pregnancy";
const PREGNANCY_OFFERING_ID = "pregnancy";
const ANDROID_PRIME_PAYMENT_URL = process.env.EXPO_PUBLIC_ANDROID_PRIME_PAYMENT_URL || "";
const ANDROID_PREGNANCY_PAYMENT_URL = process.env.EXPO_PUBLIC_ANDROID_PREGNANCY_PAYMENT_URL || "";

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

function isFutureDate(value) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp > Date.now();
}

export function resolvePremiumAccessFromProfile(profile) {
  if (Boolean(profile?.premium_override)) {
    return true;
  }

  if (!Boolean(profile?.is_premium)) {
    return false;
  }

  if (!profile?.premium_until) {
    // Backwards-compatible fallback for legacy rows that predate expiry support.
    return true;
  }

  return isFutureDate(profile.premium_until);
}

export function resolvePregnancyAccessFromProfile(profile) {
  if (!Boolean(profile?.has_pregnancy_subscription)) {
    return false;
  }

  if (!profile?.pregnancy_until) {
    // Backwards-compatible fallback for legacy rows that predate expiry support.
    return true;
  }

  return isFutureDate(profile.pregnancy_until);
}

function getPrimeEntitlementInfo(customerInfo) {
  const entitlementId = getEntitlementId();

  return (
    customerInfo?.entitlements?.active?.[entitlementId]
    || customerInfo?.entitlements?.all?.[entitlementId]
    || null
  );
}

function getPregnancyEntitlementInfo(customerInfo) {
  return (
    customerInfo?.entitlements?.active?.[PREGNANCY_ENTITLEMENT_ID]
    || customerInfo?.entitlements?.all?.[PREGNANCY_ENTITLEMENT_ID]
    || null
  );
}

function getPrimeExpirationDate(customerInfo) {
  const entitlementInfo = getPrimeEntitlementInfo(customerInfo);
  return entitlementInfo?.expirationDate || customerInfo?.latestExpirationDate || null;
}

function getPregnancyExpirationDate(customerInfo) {
  const entitlementInfo = getPregnancyEntitlementInfo(customerInfo);
  return entitlementInfo?.expirationDate || customerInfo?.latestExpirationDate || null;
}

function getPaymentTimestamp(entitlementInfo) {
  return (
    entitlementInfo?.latestPurchaseDate
    || entitlementInfo?.originalPurchaseDate
    || new Date().toISOString()
  );
}

function getExternalOrderId(entitlementInfo) {
  return (
    entitlementInfo?.transactionIdentifier
    || entitlementInfo?.originalTransactionIdentifier
    || null
  );
}

function getPurchaseSource() {
  return Platform.OS === "ios" ? "revenuecat_ios" : "revenuecat";
}

export async function getCurrentSupabaseUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user || null;
}

export function hasAndroidPrimeCheckoutConfigured() {
  return Boolean(ANDROID_PRIME_PAYMENT_URL);
}

export function hasAndroidPregnancyCheckoutConfigured() {
  return Boolean(ANDROID_PREGNANCY_PAYMENT_URL);
}

function buildAndroidPrimePaymentUrl(userId) {
  if (!ANDROID_PRIME_PAYMENT_URL) {
    return "";
  }

  const separator = ANDROID_PRIME_PAYMENT_URL.includes("?") ? "&" : "?";
  return `${ANDROID_PRIME_PAYMENT_URL}${separator}user_id=${encodeURIComponent(userId)}`;
}

function buildAndroidPregnancyPaymentUrl(userId) {
  if (!ANDROID_PREGNANCY_PAYMENT_URL) {
    return "";
  }

  const separator = ANDROID_PREGNANCY_PAYMENT_URL.includes("?") ? "&" : "?";
  return `${ANDROID_PREGNANCY_PAYMENT_URL}${separator}user_id=${encodeURIComponent(userId)}`;
}

async function readPremiumStatusFromProfile(userId) {
  // Android web checkout uses the same premium source of truth as the app UI.
  const { data, error } = await supabase
    .from("profiles")
    .select("is_premium, premium_override, premium_until")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const isPremium = resolvePremiumAccessFromProfile(data);

  if (!isPremium && Boolean(data?.is_premium) && !Boolean(data?.premium_override) && data?.premium_until) {
    await supabase
      .from("profiles")
      .update({ is_premium: false })
      .eq("id", userId);
  }

  return isPremium;
}

async function readPregnancyStatusFromProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("has_pregnancy_subscription, pregnancy_until")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const hasSubscription = resolvePregnancyAccessFromProfile(data);

  if (!hasSubscription && Boolean(data?.has_pregnancy_subscription) && data?.pregnancy_until) {
    await supabase
      .from("profiles")
      .update({ has_pregnancy_subscription: false })
      .eq("id", userId);
  }

  return hasSubscription;
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

async function writePremiumStatusToProfile(user, isPremium, premiumUntil = null, metadata = {}) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        is_premium: isPremium,
        premium_until: premiumUntil,
        premium_plan: metadata.plan || null,
        premium_source: metadata.source || (isPremium ? getPurchaseSource() : null),
        premium_last_payment_at: metadata.lastPaymentAt || null,
        premium_order_id: metadata.orderId || null,
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

  if (Platform.OS === "android") {
    const isPremium = await readPremiumStatusFromProfile(user.id);

    return {
      isPremium,
      source: "supabase",
    };
  }

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) {
    return { isPremium: false, source: setup.reason };
  }

  const customerInfo = await Purchases.getCustomerInfo();
  const isPremium = hasActiveEntitlement(customerInfo);
  const entitlementInfo = getPrimeEntitlementInfo(customerInfo);
  const premiumUntil = getPrimeExpirationDate(customerInfo);

  await writePremiumStatusToProfile(user, isPremium, premiumUntil, {
    plan: entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: isPremium ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  return {
    isPremium,
    premiumUntil,
    customerInfo,
    source: "revenuecat",
  };
}

export async function openAndroidPrimeCheckout() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    throw new Error("user-not-found");
  }

  const paymentUrl = buildAndroidPrimePaymentUrl(user.id);
  if (!paymentUrl) {
    throw new Error("android-payment-url-not-configured");
  }

  const supported = await Linking.canOpenURL(paymentUrl);
  if (!supported) {
    throw new Error("android-payment-url-invalid");
  }

  await Linking.openURL(paymentUrl);

  return {
    opened: true,
    paymentUrl,
    userId: user.id,
  };
}

export async function openAndroidPregnancyCheckout() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    throw new Error("user-not-found");
  }

  const paymentUrl = buildAndroidPregnancyPaymentUrl(user.id);
  if (!paymentUrl) {
    throw new Error("android-pregnancy-payment-url-not-configured");
  }

  const supported = await Linking.canOpenURL(paymentUrl);
  if (!supported) {
    throw new Error("android-pregnancy-payment-url-invalid");
  }

  await Linking.openURL(paymentUrl);

  return {
    opened: true,
    paymentUrl,
    userId: user.id,
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
  const entitlementInfo = getPrimeEntitlementInfo(purchaseResult.customerInfo);
  const premiumUntil = getPrimeExpirationDate(purchaseResult.customerInfo);

  await writePremiumStatusToProfile(user, isPremium, premiumUntil, {
    plan: packageToPurchase?.product?.identifier || entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: isPremium ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  if (isPremium) {
    logMetaPrimePurchase(packageToPurchase, purchaseResult.customerInfo);
  }

  return {
    isPremium,
    premiumUntil,
    customerInfo: purchaseResult.customerInfo,
  };
}

function hasActivePregnancyEntitlement(customerInfo) {
  return Boolean(customerInfo?.entitlements?.active?.[PREGNANCY_ENTITLEMENT_ID]);
}

async function writePregnancyStatusToProfile(user, hasSub, pregnancyUntil = null, metadata = {}) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        has_pregnancy_subscription: hasSub,
        pregnancy_until: pregnancyUntil,
        pregnancy_plan: metadata.plan || null,
        pregnancy_source: metadata.source || (hasSub ? getPurchaseSource() : null),
        pregnancy_last_payment_at: metadata.lastPaymentAt || null,
        pregnancy_order_id: metadata.orderId || null,
      },
      { onConflict: "id" }
    );
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
  const entitlementInfo = getPregnancyEntitlementInfo(purchaseResult.customerInfo);
  const pregnancyUntil = getPregnancyExpirationDate(purchaseResult.customerInfo);

  await writePregnancyStatusToProfile(user, hasSub, pregnancyUntil, {
    plan: packageToPurchase?.product?.identifier || entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: hasSub ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  if (hasSub) {
    logMetaPregnancyPurchase(packageToPurchase, purchaseResult.customerInfo);
  }

  return { hasSubscription: hasSub, customerInfo: purchaseResult.customerInfo };
}

export async function checkPregnancySubscriptionStatus() {
  const user = await getCurrentSupabaseUser();
  if (!user) return { hasSubscription: false, source: "no-user" };

  if (Platform.OS === "android") {
    const hasSubscription = await readPregnancyStatusFromProfile(user.id);

    return {
      hasSubscription,
      source: "supabase",
    };
  }

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) return { hasSubscription: false, source: setup.reason };

  const customerInfo = await Purchases.getCustomerInfo();
  const hasSub = hasActivePregnancyEntitlement(customerInfo);
  const entitlementInfo = getPregnancyEntitlementInfo(customerInfo);
  const pregnancyUntil = getPregnancyExpirationDate(customerInfo);

  await writePregnancyStatusToProfile(user, hasSub, pregnancyUntil, {
    plan: entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: hasSub ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  return { hasSubscription: hasSub, pregnancyUntil, customerInfo, source: "revenuecat" };
}

export async function restorePregnancyPurchases() {
  const user = await getCurrentSupabaseUser();
  if (!user) throw new Error("user-not-found");

  const setup = await ensurePurchasesConfigured(user.id);
  if (!setup.configured) throw new Error("revenuecat-not-configured");

  const customerInfo = await Purchases.restorePurchases();
  const hasSub = hasActivePregnancyEntitlement(customerInfo);
  const entitlementInfo = getPregnancyEntitlementInfo(customerInfo);
  const pregnancyUntil = getPregnancyExpirationDate(customerInfo);

  await writePregnancyStatusToProfile(user, hasSub, pregnancyUntil, {
    plan: entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: hasSub ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  return { hasSubscription: hasSub, pregnancyUntil, customerInfo };
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
  const entitlementInfo = getPrimeEntitlementInfo(customerInfo);
  const premiumUntil = getPrimeExpirationDate(customerInfo);

  await writePremiumStatusToProfile(user, isPremium, premiumUntil, {
    plan: entitlementInfo?.productIdentifier || null,
    source: getPurchaseSource(),
    lastPaymentAt: isPremium ? getPaymentTimestamp(entitlementInfo) : null,
    orderId: getExternalOrderId(entitlementInfo),
  });

  return {
    isPremium,
    premiumUntil,
    customerInfo,
  };
}
