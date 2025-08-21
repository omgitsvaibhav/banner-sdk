// API Configuration
//export const API_BASE_URL = "http://localhost:8005/cookie-manager/api/v1";
//export const API_BASE_URL = "https://preprod-bluetic-cm-svc.neokred.tech/cookie-manager/api/v1";
export const API_BASE_URL = "https://qa-bluetic-cookie.neokred.tech:9444/cookie-manager/api/v1";
//export const API_BASE_URL = "https://cookie-management-svc.blutic.club/cookie-manager/api/v1";

let browserId = localStorage.getItem("browserId");
let domainId = localStorage.getItem("domainId");

export const Consent = {
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  MODIFIED: "Modified",
  WITHDRAWN: "Withdrawn",
};

// Google Consent Mode v2 parameter mapping
const CONSENT_MODE_MAPPING = {
  // Default platform categories
  advertising: ["ad_storage", "ad_user_data", "ad_personalization"],
  analytics: ["analytics_storage"],
  performance: ["analytics_storage"],
  social: ["ad_storage", "ad_user_data"],
  functional: ["functionality_storage"],
  others: ["ad_storage", "analytics_storage"],
  necessary: [],

  // Add mappings for custom categories as needed
  // marketing: ['ad_storage', 'ad_user_data', 'ad_personalization'],
  // targeting: ['ad_storage', 'ad_personalization'],
};

function setBannerShownTimestamp() {
  const timestamp = Date.now();
  localStorage.setItem("banner_shown_timestamp", timestamp.toString());
  return timestamp;
}

// Calculate interaction time
function calculateInteractionTime() {
  const shownTimestamp = localStorage.getItem("banner_shown_timestamp");
  if (!shownTimestamp) {
    console.warn("Cookie Banner SDK: No banner shown timestamp found");
    return null;
  }
  
  const currentTime = Date.now();
  const interactionTime = currentTime - parseInt(shownTimestamp);
  
  // Clean up the timestamp after calculation
  localStorage.removeItem("banner_shown_timestamp");
  
  return interactionTime; // Time in milliseconds
}

function dispatchCookieEvent(eventName, detail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function getCookiesByStatus(cookieData, cookieSettings) {
  const acceptedCookies = [];
  const rejectedCookies = [];

  Object.entries(cookieData).forEach(([categoryKey, category]) => {
    const isAccepted = cookieSettings[categoryKey] === true;

    category.cookies.forEach((cookie) => {
      const cookieInfo = {
        name: cookie.name,
        category: categoryKey,
        categoryTitle: category.title,
        description: cookie.description,
        duration: cookie.duration,
        isAlwaysActive: category.isAlwaysActive,
      };

      if (isAccepted) {
        acceptedCookies.push(cookieInfo);
      } else {
        rejectedCookies.push(cookieInfo);
      }
    });
  });

  return { acceptedCookies, rejectedCookies };
}

function generateInteractionId() {
  let interactionId = localStorage.getItem("cookie_interaction_id");

  if (!interactionId) {
    // Generate a unique interaction ID (you can use UUID or a simple timestamp-based ID)
    interactionId =
      "interaction_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9);
    localStorage.setItem("cookie_interaction_id", interactionId);
  }

  return interactionId;
}

// Clean up interaction ID from localStorage
function cleanupInteractionId() {
  localStorage.removeItem("cookie_interaction_id");
}

async function trackIgnoredInteraction() {
  try {
    if (!domainId) {
      console.error("Cookie Banner SDK: No domainId found");
      return;
    }

    const interactionId = generateInteractionId();

    if (browserId) return;

    const trackingData = {
      interactionId,
      browserId,
      domainId,
      interactionType: "Ignored",
    };

    // Use sendBeacon for reliable tracking during page unload
    const url = `${API_BASE_URL}/dashboard-analytics`;

    // Try sendBeacon first (more reliable during page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(trackingData)], {
        type: "application/json",
      });
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback to synchronous fetch
      await makeApiCall(`dashboard-analytics`, "POST", trackingData);
    }

    // Also dispatch custom event for any listeners
    // dispatchCookieEvent("cookieConsentIgnored", {
    //   interactionId,
    //   status: "Ignored",
    // });
    cleanupInteractionId();
  } catch (error) {
    console.error("Cookie Banner SDK: Error tracking interaction", error);
  }
}

async function setBanenrShown() {
  try{
    if (!domainId) {
      console.error("Cookie Banner SDK: No domainId found");
      return;
    }

    const interactionId = generateInteractionId();
    const shownTimestamp = setBannerShownTimestamp();
    const trackingData = {
      interactionId,
      browserId,
      domainId,
      interactionType: "Shown",
    };

    await makeApiCall("dashboard-analytics", "POST", trackingData)
  } catch(e){
    console.error('Cookie Banner SDK: Error during analytics:', e);
  }
}

async function trackInteraction(status, data) {
  try {
    if (!domainId) {
      console.error("Cookie Banner SDK: No domainId found");
      return;
    }

    const interactionId = generateInteractionId();
    let trackingData = {
      interactionId,
      browserId,
      domainId,
      interactionType: status,
      selectedCategories: data
    };

    // Add interaction time only for accept/reject actions
    if (status === Consent.ACCEPTED || status === Consent.REJECTED) {
      const interactionTime = calculateInteractionTime();
      if (interactionTime !== null) {
        trackingData.interactionTime = interactionTime;
        //console.log(`Cookie Banner SDK: Interaction time recorded: ${interactionTime}ms`);
      }
    }

    await makeApiCall("dashboard-analytics", "POST", trackingData);
  } catch (e) {
    console.error("Cookie Banner SDK: Error tracking interaction:", e);
  }
}

// Enhanced Google Consent Mode v2 mapping
function mapConsentToGoogleConsentMode(cookieSettings) {
  // Default denied (GDPR/most global laws require explicit consent)
  const consentParams = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "denied", // Custom parameter for functional cookies
  };

  // Map categories to consent mode parameters
  Object.entries(cookieSettings).forEach(([categoryKey, isAccepted]) => {
    if (isAccepted && CONSENT_MODE_MAPPING[categoryKey]) {
      CONSENT_MODE_MAPPING[categoryKey].forEach((consentParam) => {
        consentParams[consentParam] = "granted";
      });
    }
  });

  return consentParams;
}

// Initialize Google Consent Mode with default denied state
function initializeGoogleConsentMode() {
  // Check if gtag is available
  if (typeof window.gtag === "function") {
    console.log(
      "Cookie Banner SDK: Initializing Google Consent Mode with default denied state"
    );

    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "denied",
      wait_for_update: 500, // Wait up to 2 seconds for consent update
    });
  } else {
    console.warn("Cookie Banner SDK: No gtag found.");
  }
}

// Update Google Consent Mode based on user preferences
function updateGoogleConsentMode(cookieSettings) {
  if (typeof window.gtag !== "function") {
    console.warn("Cookie Banner SDK: gtag not available for consent update");
    return;
  }

  const consentParams = mapConsentToGoogleConsentMode(cookieSettings);

  //console.log('Cookie Banner SDK: Updating Google Consent Mode', consentParams);

  // Update consent mode
  window.gtag("consent", "update", consentParams);

  // Send a custom event to GTM for additional tracking
  window.gtag("event", "cookie_consent_update", {
    event_category: "Cookie Consent",
    event_label: "Consent Updated",
    custom_map: {
      cookie_settings: JSON.stringify(cookieSettings),
      consent_params: JSON.stringify(consentParams),
    },
  });
}

async function trackConsentActionWithGTM(status, cookieSettings) {
  try {
    const trackingData = {
      cookieSettings,
      browserId,
      status,
    };

    //console.log(`Cookie Banner SDK: Tracking consent action: ${status}`);

    // Update Google Consent Mode
    updateGoogleConsentMode(cookieSettings);

    // Send custom event to GTM
    if (typeof window.gtag === "function") {
      window.gtag("event", "cookie_consent_action", {
        event_category: "Cookie Consent",
        event_action: status,
        event_label: "User Consent Action",
        custom_map: {
          consent_status: status,
          cookie_settings: JSON.stringify(cookieSettings),
        },
      });
    }

    // Also send to dataLayer if GTM is present
    if (typeof window.dataLayer !== "undefined") {
      window.dataLayer.push({
        event: "cookieConsentAction",
        consentStatus: status,
        cookieSettings: cookieSettings,
        consentMode: mapConsentToGoogleConsentMode(cookieSettings),
      });
    }

    // Track to your API
    const result = await makeApiCall("consent/save", "POST", trackingData);

    if (result) {
      console.log("Cookie Banner SDK: Consent action tracked successfully");
      if (!browserId && result.data?.browserId)
        localStorage.setItem("browserId", result.data.browserId);
      return;
    }
  } catch (e) {
    console.error("Cookie Banner SDK: Failed to save user preference", e);
  }
}

// Utility function to get domain ID from script URL
function getDomainIdFromScript() {
  if (domainId){
    return domainId;
  }
  const scripts = document.getElementsByTagName("script");
  for (let script of scripts) {
    if (script.src && script.src.includes("banner-sdk")) {
      const url = new URL(script.src);
      localStorage.setItem("domainId", url.searchParams.get("domainId"));
      return url.searchParams.get("domainId");
    }
  }
}

// Utility function to make API calls
async function makeApiCall(endpoint, method = "POST", data = null) {
  domainId = getDomainIdFromScript();

  if (!domainId) {
    console.error("Cookie Banner SDK: No domainId found in script URL");
    return null;
  }

  let url = `${API_BASE_URL}/${endpoint}?domainId=${domainId}`;

  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data && method !== "GET") {
    options.body = JSON.stringify(data);
  }

  if (data && method === "GET") {
    url = `${url}&${data}`;
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(
        `API call failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Cookie Banner SDK: API Error:", error);
    return null;
  }
}

// 1. API call for first-time integration tracking
async function trackIntegration() {
  console.log("Cookie Banner SDK: Tracking integration...");
  const result = await makeApiCall("banner/integration", "PATCH", {
    status: true,
  });

  if (result) {
    console.log("Cookie Banner SDK: Integration tracked successfully");
    // Store integration tracking in sessionStorage to avoid duplicate calls
    sessionStorage.setItem("cookie_banner_integration_tracked", "true");
    //getDomainIdFromScript();
  }

  return result;
}

// 2. API call for script removal detection
async function trackRemoval() {
  console.log("Cookie Banner SDK: Tracking script removal...");
  const result = await makeApiCall("banner/integration", "PATCH", {
    status: false,
  });

  if (result) {
    console.log("Cookie Banner SDK: Script removal tracked successfully");
  }

  return result;
}

// 3. API call to fetch banner configuration data
async function fetchBannerConfig() {
  console.log("Cookie Banner SDK: Fetching banner configuration...");

  // First, send request context (optional - for analytics)
  //await makeApiCall("banner/config/request", "POST", configData);

  // Fetch the actual configuration
  //const query = browserId ? `?browserId=${browserId}` : "";
  const result = await makeApiCall(`banner/configs`, "GET", `browserId=${browserId}`);

  if (result) {
    console.log("Cookie Banner SDK: Banner configuration fetched successfully");
    return result.data || result;
  }

  // Return default configuration if API fails
  //return getDefaultBannerConfig();
  console.error("Domain not found");
}

// Enhanced consent tracking functions
async function trackConsentAction(status, cookieSettings) {
  return await trackConsentActionWithGTM(status, cookieSettings);
}

// Main initialization function
async function initializeCookieBannerSDK() {
  try {
    initializeGoogleConsentMode();
    // Check if already initialized in this session
    if (sessionStorage.getItem("cookie_banner_integration_tracked")) {
      console.log("Cookie Banner SDK: Already initialized in this session");
      return;
    }

    // Track integration
    await trackIntegration();

    // Fetch banner configuration
    const config = await fetchBannerConfig();

    return config;
  } catch (error) {
    console.error("Cookie Banner SDK: Initialization failed:", error);
  }
}

function parseBannerApiData(bannerData) {
  // Group cookies by category id
  const cookiesByCategory = {};
  for (const category of bannerData.categories) {
    cookiesByCategory[category._id] = {
      title: category.name,
      description: category.description,
      cookies: [],
      isAlwaysActive: category.isAlwaysActive,
    };
  }

  // Place each cookie in its category
  for (const cookie of bannerData.cookies) {
    const cat = cookiesByCategory[cookie.category];
    if (cat) {
      cat.cookies.push({
        name: cookie.name,
        duration: cookie.validityPeriod,
        description: cookie.description,
      });
    }
  }

  // Convert to array or object as needed by your component
  // Here, let's keep it as an object keyed by category name for easy access
  const cookieData = {};
  for (const catId in cookiesByCategory) {
    const cat = cookiesByCategory[catId];
    if (cat.cookies.length > 0) {
      cookieData[cat.title.toLowerCase()] = {
        title: cat.title,
        description: cat.description,
        cookies: cat.cookies,
        isAlwaysActive: cat.isAlwaysActive,
      };
    }
  }

  // Banner details
  const bannerDetails = {
    title: bannerData.banner.title,
    description: bannerData.banner.description,
    privacyPolicy:
      bannerData.banner.selectedPolicyUrl ||
      (bannerData.banner.policies[0] &&
        bannerData.banner.policies[0].policyUrl),
    acceptButtonText: bannerData.banner.acceptButtonText,
    declineButtonText: bannerData.banner.declineButtonText,
    manageButtonText: bannerData.banner.manageButtonText,
    titleColor: bannerData.banner.titleColor,
    descriptionColor: bannerData.banner.descriptionColor,
    acceptButtonColor: bannerData.banner.acceptButtonColor,
    declineButtonColor: bannerData.banner.declineButtonColor,
    manageButtonColor: bannerData.banner.manageButtonColor,
    acceptButtonTextColor: bannerData.banner.acceptButtonTextColor,
    declineButtonTextColor: bannerData.banner.declineButtonTextColor,
    manageButtonTextColor: bannerData.banner.manageButtonTextColor,
    declineButtonBorder: bannerData.banner.declineButtonBorder,
    manageButtonBorder: bannerData.banner.manageButtonBorder,
    position: bannerData.banner.position,
    backgroundColor: bannerData.banner.backgroundColor,
  };

  return { cookieData, bannerDetails };
}

export {
  initializeCookieBannerSDK,
  trackIntegration,
  trackRemoval,
  fetchBannerConfig,
  trackConsentAction,
  trackConsentActionWithGTM,
  parseBannerApiData,
  dispatchCookieEvent,
  getCookiesByStatus,
  mapConsentToGoogleConsentMode,
  initializeGoogleConsentMode,
  updateGoogleConsentMode,
  CONSENT_MODE_MAPPING,
  generateInteractionId,
  setBanenrShown,
  trackIgnoredInteraction,
  cleanupInteractionId,
  trackInteraction
};
