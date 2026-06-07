import { Platform } from "react-native";

const META_EVENTS = {
  APP_OPENED: "cycle_care_app_opened",
  PAYWALL_VIEWED: "cycle_care_paywall_viewed",
  PRIME_PURCHASED: "cycle_care_prime_purchased",
  PREGNANCY_PURCHASED: "cycle_care_pregnancy_purchased",
};

let isInitialized = false;
let hasLoggedAppOpen = false;

function getFacebookSdk() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return null;
  }

  try {
    return require("react-native-fbsdk-next");
  } catch (error) {
    console.log("Meta SDK is not available:", error);
    return null;
  }
}

async function requestTrackingPermission() {
  if (Platform.OS !== "ios") {
    return "unavailable";
  }

  try {
    const { requestTrackingPermissionsAsync } = require("expo-tracking-transparency");
    const { status } = await requestTrackingPermissionsAsync();
    return status;
  } catch (error) {
    console.log("ATT permission request failed:", error);
    return "unavailable";
  }
}

export async function initializeMetaAppEvents() {
  if (isInitialized) {
    return;
  }

  const facebookSdk = getFacebookSdk();
  if (!facebookSdk?.Settings) {
    return;
  }

  const trackingStatus = await requestTrackingPermission();

  try {
    facebookSdk.Settings.initializeSDK();
    await facebookSdk.Settings.setAdvertiserTrackingEnabled(
      Platform.OS === "ios" ? trackingStatus === "granted" : true
    );

    isInitialized = true;
    logMetaEvent(META_EVENTS.APP_OPENED, {
      platform: Platform.OS,
      att_status: trackingStatus,
    });
  } catch (error) {
    console.log("Meta SDK initialization failed:", error);
  }
}

export function logMetaEvent(eventName, parameters = {}, valueToSum = undefined) {
  const facebookSdk = getFacebookSdk();
  if (!facebookSdk?.AppEventsLogger || !eventName) {
    return;
  }

  try {
    if (typeof valueToSum === "number") {
      facebookSdk.AppEventsLogger.logEvent(eventName, valueToSum, parameters);
    } else {
      facebookSdk.AppEventsLogger.logEvent(eventName, parameters);
    }
  } catch (error) {
    console.log("Meta App Event failed:", eventName, error);
  }
}

export function logMetaAppOpenOnce() {
  if (hasLoggedAppOpen) {
    return;
  }

  hasLoggedAppOpen = true;
  logMetaEvent(META_EVENTS.APP_OPENED, { platform: Platform.OS });
}

export function logMetaPaywallViewed(source = "premium") {
  logMetaEvent(META_EVENTS.PAYWALL_VIEWED, { source });
}

export function logMetaPrimePurchase(packageToPurchase, customerInfo) {
  const product = packageToPurchase?.product;
  const price = Number(product?.price || 0);
  const currency = product?.currencyCode || product?.currency || "USD";

  logMetaEvent(
    META_EVENTS.PRIME_PURCHASED,
    {
      fb_currency: currency,
      product_id: product?.identifier || packageToPurchase?.identifier || "prime",
      entitlement_id: "prime",
    },
    price
  );

  const facebookSdk = getFacebookSdk();
  if (facebookSdk?.AppEventsLogger && price > 0) {
    try {
      facebookSdk.AppEventsLogger.logPurchase(price, currency, {
        product_id: product?.identifier || packageToPurchase?.identifier || "prime",
        entitlement_active: customerInfo?.entitlements?.active?.prime ? 1 : 0,
      });
    } catch (error) {
      console.log("Meta purchase event failed:", error);
    }
  }
}

export function logMetaPregnancyPurchase(packageToPurchase, customerInfo) {
  const product = packageToPurchase?.product;
  const price = Number(product?.price || 0);
  const currency = product?.currencyCode || product?.currency || "USD";

  logMetaEvent(
    META_EVENTS.PREGNANCY_PURCHASED,
    {
      fb_currency: currency,
      product_id: product?.identifier || packageToPurchase?.identifier || "pregnancy",
      entitlement_id: "pregnancy",
    },
    price
  );

  const facebookSdk = getFacebookSdk();
  if (facebookSdk?.AppEventsLogger && price > 0) {
    try {
      facebookSdk.AppEventsLogger.logPurchase(price, currency, {
        product_id: product?.identifier || packageToPurchase?.identifier || "pregnancy",
        entitlement_active: customerInfo?.entitlements?.active?.pregnancy ? 1 : 0,
      });
    } catch (error) {
      console.log("Meta pregnancy purchase event failed:", error);
    }
  }
}
