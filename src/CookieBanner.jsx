import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  initializeCookieBannerSDK,
  trackConsentAction,
  fetchBannerConfig,
  parseBannerApiData,
  Consent,
  dispatchCookieEvent,
  getCookiesByStatus,
  updateGoogleConsentMode,
  mapConsentToGoogleConsentMode,
  setBanenrShown,
  generateInteractionId,
  trackIgnoredInteraction,
  trackInteraction,
} from "./bannerActivity";

const CookieBanner = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("consent");
  const [cookieSettings, setCookieSettings] = useState({});
  const [prevCookieSettings, setPrevCookieSettings] = useState({});
  const [isVisible, setIsVisible] = useState(true);
  const [bannerData, setBannerData] = useState();
  const [cookieData, setCookieData] = useState();
  const [hasSavedPreference, setHasSavedPreference] = useState();
  const [shouldShowBanner, setShouldShowBanner] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [interactionId, setInteractionId] = useState(null);
  const [loading, setLoading] = useState(false);

  const areSettingsEqual = (a, b) => {
    return JSON.stringify(a) === JSON.stringify(b);
  };

  const areAllNonNecessaryCookiesRejected = (settings) => {
    return Object.entries(settings).every(
      ([key, value]) => key === "necessary" || value === false
    );
  };

  // Apply consent settings to Google Consent Mode
  const applyConsentToGoogleConsentMode = (settings) => {
    updateGoogleConsentMode(settings);
  };

  useEffect(() => {
    // Generate or get existing interaction ID
    const existingInteractionId = generateInteractionId();
    setInteractionId(existingInteractionId);

    // Track ignored interaction on page unload if no interaction occurred
    const handleBeforeUnload = () => {
      if (!hasInteracted && interactionId) {
        trackIgnoredInteraction();
      }
    };

    // Add event listener for page unload
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup function
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasInteracted, interactionId]);

  useEffect(() => {
    async function init() {
      const config = await initializeCookieBannerSDK();
      await setBanenrShown();
      let categorisedData;
      let apiCookieSettings = null;
      let consentArr = [];

      if (!config) {
        const bannerData = await fetchBannerConfig();
        categorisedData = parseBannerApiData(bannerData);
        consentArr = bannerData.consent || [];
        setHasSavedPreference(consentArr.length !== 0);
      } else {
        categorisedData = parseBannerApiData(config);
        consentArr = config.consent || [];
        setHasSavedPreference(consentArr.length !== 0);
      }

      for (const item of consentArr) {
        if (item.cookieSettings) {
          apiCookieSettings = item.cookieSettings;
          break;
        }
      }

      setBannerData(categorisedData.bannerDetails);
      setCookieData(categorisedData.cookieData);

      // Check if there's cookie data
      if (
        !categorisedData.cookieData ||
        Object.keys(categorisedData.cookieData).length === 0
      ) {
        console.log(
          "Cookie Banner SDK: No cookie data found. Banner will not be displayed."
        );
        setShouldShowBanner(false);
        return;
      }

      setShouldShowBanner(true);

      // Dynamically set cookieSettings based on categories
      if (
        categorisedData.cookieData &&
        Object.keys(categorisedData.cookieData).length > 0
      ) {
        const initialSettings = {};
        for (const [key] of Object.entries(categorisedData.cookieData)) {
          if (
            apiCookieSettings &&
            typeof apiCookieSettings[key] === "boolean"
          ) {
            initialSettings[key] = apiCookieSettings[key];
          } else {
            initialSettings[key] = true;
          }
        }
        setCookieSettings(initialSettings);
        setPrevCookieSettings(initialSettings);
        if (consentArr.length > 0) {
          applyConsentToGoogleConsentMode(initialSettings);
        }
      }
    }

    init();
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isModalOpen]);

  // Trap scroll inside cookie category list
  useEffect(() => {
    if (!isModalOpen) return;

    const scrollContainers = document.querySelectorAll(
      ".modal-content-scroll, .cookie-category-scroll"
    );
    if (!scrollContainers) return;

    const preventScrollPropagation = (e) => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainers;
      const atTop = scrollTop === 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight;

      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    };

    scrollContainers.forEach((container) => {
      container.addEventListener("wheel", preventScrollPropagation, {
        passive: false,
      });
    });

    return () => {
      scrollContainers.forEach((container) => {
        container.removeEventListener("wheel", preventScrollPropagation);
      });
    };
  }, [isModalOpen]);

  const handleAccept = async () => {
    setLoading(true);
    setHasInteracted(true);
    setIsVisible(false);

    // Determine status in a single pass
    const status = (() => {
      if (!hasSavedPreference) {
        // First-time decision
        const hasAcceptedNonNecessary = Object.entries(cookieSettings).some(
          ([key, value]) => key !== "necessary" && value === true
        );

        return hasAcceptedNonNecessary ? Consent.ACCEPTED : Consent.REJECTED;
      } else {
        // For existing preferences
        const allNonNecessaryFalse = Object.entries(cookieSettings).every(
          ([key, value]) => key === "necessary" || value === false
        );

        return allNonNecessaryFalse ? Consent.WITHDRAWN : Consent.MODIFIED;
      }
    })();

    const { acceptedCookies, rejectedCookies } = getCookiesByStatus(
      cookieData,
      cookieSettings
    );

    const consentModeParams = mapConsentToGoogleConsentMode(cookieSettings);

    dispatchCookieEvent("cookieConsentAccept", {
      status,
      cookieSettings,
      acceptedCookies,
      rejectedCookies,
    });

    applyConsentToGoogleConsentMode(cookieSettings);

    if (typeof window.dataLayer !== "undefined") {
      window.dataLayer.push({
        event: "cookieConsentAccept",
        consentStatus: status,
        cookieSettings: cookieSettings,
        acceptedCookies: acceptedCookies.length,
        rejectedCookies: rejectedCookies.length,
        consentMode: consentModeParams,
      });
    }

    try {
      await trackConsentAction(status, cookieSettings);
      await trackInteraction(status, cookieSettings);
    } catch (error) {
      console.error("Cookie Banner SDK: Error tracking consent action:", error);
    } finally {
      setLoading(false); // Stop loading
    }
  };

  const handleRejectAll = async () => {
    setLoading(true);
    setHasInteracted(true);
    setIsVisible(false);

    // Set all cookie settings to false except necessary cookies
    const rejectedSettings = {};
    const cookieKeys = Object.keys(cookieSettings);

    for (let i = 0; i < cookieKeys.length; i++) {
      const key = cookieKeys[i];
      rejectedSettings[key] = key === "necessary" ? true : false;
    }

    setCookieSettings(rejectedSettings);

    // Determine status based on whether user had previous preferences
    const status = !hasSavedPreference ? Consent.REJECTED : Consent.WITHDRAWN;

    const { acceptedCookies, rejectedCookies } = getCookiesByStatus(
      cookieData,
      rejectedSettings
    );

    const consentModeParams = mapConsentToGoogleConsentMode(rejectedSettings);

    dispatchCookieEvent("cookieConsentReject", {
      status,
      cookieSettings: rejectedSettings,
      acceptedCookies,
      rejectedCookies,
    });

    // Apply consent to Google Consent Mode
    applyConsentToGoogleConsentMode(rejectedSettings);

    // Send to GTM dataLayer for advanced tracking
    if (typeof window.dataLayer !== "undefined") {
      window.dataLayer.push({
        event: "cookieConsentReject",
        consentStatus: status,
        cookieSettings: rejectedSettings,
        acceptedCookies: acceptedCookies.length,
        rejectedCookies: rejectedCookies.length,
        consentMode: consentModeParams,
      });
    }

    try {
      await trackConsentAction(status, rejectedSettings);
      await trackInteraction(status, rejectedSettings);
    } catch (error) {
      console.error("Cookie Banner SDK: Error tracking consent action:", error);
    } finally {
      setLoading(false); // Stop loading
    }
  };

  const toggleCookieSetting = (type) => {
    if (type === "necessary") return; // Can't toggle always active cookies
    setCookieSettings((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const ToggleSwitch = ({ isOn, disabled, onClick }) => (
    <div
      className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      } ${isOn ? "bg-blue-500" : "bg-gray-300"}`}
      onClick={disabled ? undefined : onClick}
    >
      <div
        className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${
          isOn ? "right-0.5" : "left-0.5"
        }`}
      />
    </div>
  );

  const CookieDataItems = ({ category, categoryKey, isOpen, onToggle }) => {
    return (
      <div className="border-b border-gray-200 last:border-b-0 text-black">
        <div
          className="w-full py-5 text-left flex justify-between items-center hover:cursor-pointer transition-colors duration-200"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <div className="flex w-full">
            <div className="w-[5%]">
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </div>
            <div className="flex flex-col w-[95%]">
              <div className="flex justify-between items-center font-medium text-gray-800 text-sm w-full">
                <span>{category.title}</span>
                <ToggleSwitch
                  isOn={cookieSettings[categoryKey]}
                  disabled={categoryKey === "necessary"}
                  onClick={() => toggleCookieSetting(categoryKey)}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1 !w-3/4">
                {category.description}
              </div>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out bg-[#f0f2f7] w-full ${
                  isOpen
                    ? "max-h-96 opacity-100 mt-1.5 overscroll-y-auto rounded-lg"
                    : "max-h-0 opacity-0"
                }`}
              >
                {category.cookies.map((cookie, index) => (
                  <div
                    key={index}
                    className="border-b border-b-gray-300 last:border-none w-full"
                  >
                    <div className="text-xs flex flex-col py-4 px-3">
                      <div className="flex items-start w-full">
                        <div className="w-1/4 font-semibold">Cookie Name </div>
                        <div className="w-[5%] font-semibold">: </div>
                        <div className="w-[70%]">{cookie.name}</div>
                      </div>
                      <div className="flex items-start w-full">
                        <div className="w-1/4 font-semibold">Duration </div>
                        <div className="w-[5%] font-semibold">: </div>
                        <div className="w-[70%]">{cookie.duration}</div>
                      </div>
                      <div className="flex items-start w-full">
                        <div className="w-1/4 font-semibold">Description </div>
                        <div className="w-[5%] font-semibold">: </div>
                        <div className="w-[70%]">{cookie.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main CookieDataDropdown Component
  const CookieDataDropdown = ({
    title = "Manage Consent preferences",
    data = {},
    allowMultipleOpen = true,
    className = "",
  }) => {
    const [openItems, setOpenItems] = useState(new Set());

    const handleToggle = (index) => {
      const newOpenItems = new Set(openItems);

      if (allowMultipleOpen) {
        // Allow multiple items to be open
        if (newOpenItems.has(index)) {
          newOpenItems.delete(index);
        } else {
          newOpenItems.add(index);
        }
      } else {
        // Only allow one item to be open at a time
        if (newOpenItems.has(index)) {
          newOpenItems.clear();
        } else {
          newOpenItems.clear();
          newOpenItems.add(index);
        }
      }

      setOpenItems(newOpenItems);
    };

    const categories = Object.entries(data).map(([key, value]) => ({
      key,
      ...value,
    }));

    return (
      <div className={`${className} cookie-category-scroll`}>
        <div className="font-bold !text-lg text-black">{title}</div>

        <div className="">
          {categories.map((category, index) => (
            <CookieDataItems
              key={category.key}
              category={category}
              categoryKey={category.key}
              isOpen={openItems.has(index)}
              onToggle={() => handleToggle(index)}
            />
          ))}
        </div>
      </div>
    );
  };

  const Modal = () => (
    <div
      className={`fixed inset-0 bg-[rgba(1,1,1,0.1)] z-[100000] ${
        isModalOpen ? "block" : "hidden"
      }`}
    >
      <div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-xl max-md:w-full md:max-w-xl max-h-[90vh] !overflow-y-hidden shadow-2xl"
        style={{ backgroundColor: bannerData.backgroundColor }}
      >
        {/* Modal Tabs */}
        <div className="relative w-full h-full max-md:pb-5 md:pb-12">
          <div
            className="text-black !text-sm hover:!cursor-pointer absolute md:top-3 md:right-4 max-md:top-1 max-md:right-1"
            onClick={() => setIsModalOpen(false)}
          >
            x
          </div>
          <div className="flex max-md:justify-evenly border-b border-gray-200 max-md:bg-white md:bg-[#f6f6f6]">
            <div
              onClick={() => setActiveTab("consent")}
              className={`py-3 px-5 text-sm font-medium border-b-2 !rounded-none hover:!cursor-pointer ${
                activeTab === "consent"
                  ? "text-blue-500 !bg-white !border-b-blue-500 md:!border-r md:!border-r-gray-200"
                  : "!bg-transparent !text-gray-500 !border-transparent"
              }`}
            >
              Consent
            </div>
            <div
              onClick={() => setActiveTab("about")}
              className={`py-3 px-5 text-sm font-medium border-b-2 !rounded-none hover:!cursor-pointer ${
                activeTab === "about"
                  ? "text-blue-500 !bg-white !border-b-blue-500 !border-x !border-x-gray-200"
                  : "!bg-transparent !text-gray-500 !border-transparent"
              }`}
            >
              About Cookies
            </div>
          </div>
          {/* Modal Content */}
          <div className="modal-content-scroll p-5">
            {activeTab === "consent" ? (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p
                    className="font-semibold max-md:!text-lg md:!text-xl"
                    style={{ color: bannerData.titleColor }}
                  >
                    {bannerData.title}
                  </p>
                  <div className="text-xs border border-gray-300 bg-gray-50 text-gray-800 rounded-md px-3 py-1 flex items-center gap-1">
                    English <ChevronDown size={10} />
                  </div>
                </div>

                <div
                  className="!text-sm mb-4 leading-relaxed !max-h-36 overflow-y-auto"
                  style={{ color: bannerData.descriptionColor }}
                  dangerouslySetInnerHTML={{ __html: bannerData.description }}
                />

                <div className="flex items-center gap-5 text-sm mb-5">
                  <a
                    href={bannerData.privacyPolicy}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="!text-black !underline !opacity-75 !font-semibold hover:!opacity-100"
                  >
                    Privacy Policy
                  </a>
                </div>
                <CookieDataDropdown
                  data={cookieData}
                  className="pt-4 px-4 h-[200px] overflow-y-auto bg-white rounded-lg"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-y-2">
                <p className="max-md:!text-lg md:!text-xl font-semibold text-gray-800">
                  What are cookies?
                </p>
                <div className="!text-sm text-gray-600 leading-relaxed">
                  Cookies are small text files that can be used by websites to
                  make a user's experience more efficient.
                </div>
                <div className="!text-sm text-gray-600 leading-relaxed">
                  The law states that we can store cookies on your device if
                  they are strictly necessary for the operation of this site.
                  For all other types of cookies we need your permission. This
                  site uses different types of cookies. Some cookies are placed
                  by third party services that appear on our pages. You can at
                  any time change or withdraw your consent from the Cookie
                  Declaration on our website.
                </div>
                <div className="!text-sm text-gray-600 leading-relaxed">
                  Learn more about who we are, how you can contact us and how we
                  process personal data in our Privacy Policy.
                </div>
              </div>
            )}
          </div>
          <div className="w-full flex max-md:flex-col max-md:gap-y-2 md:gap-x-2 justify-center items-center px-5">
            <button
              onClick={handleRejectAll}
              className="!flex-1 !p-3 !text-sm !rounded-md border hover:cursor-pointer disabled:hover:!cursor-not-allowed max-md:w-full focus:!outline-none"
              style={{
                backgroundColor: bannerData.declineButtonColor,
                color: bannerData.declineButtonTextColor,
                border:
                  bannerData.declineButtonColor === "#ffffff" &&
                  bannerData.backgroundColor === "#ffffff"
                    ? "1px solid #e5e7eb"
                    : "none",
              }}
              disabled={
                loading ||
                (areSettingsEqual(prevCookieSettings, cookieSettings) &&
                  areAllNonNecessaryCookiesRejected(cookieSettings))
              }
            >
              {loading && "Loading..."}
              {!hasSavedPreference
                ? bannerData.declineButtonText
                : "Withdraw your Consent"}
            </button>
            <button
              onClick={handleAccept}
              disabled={
                loading ||
                (hasSavedPreference &&
                  areSettingsEqual(prevCookieSettings, cookieSettings))
              }
              className="!flex-1 !p-3 !text-sm !rounded-md border-none hover:cursor-pointer disabled:!bg-gray-300 disabled:!text-[#7c828b] disabled:hover:!cursor-not-allowed max-md:w-full focus:!outline-none"
              style={{
                backgroundColor: bannerData.acceptButtonColor,
                color: bannerData.acceptButtonTextColor,
                border:
                  bannerData.acceptButtonColor === "#ffffff" &&
                  bannerData.backgroundColor === "#ffffff"
                    ? "1px solid #e5e7eb"
                    : "none",
              }}
            >
              {loading && "Loading..."}
              {!hasSavedPreference
                ? bannerData.acceptButtonText
                : "Change your Consent"}
            </button>
          </div>
          {/* Modal Footer */}
          <div className="max-md:hidden absolute bottom-4 right-5 text-gray-500">
            <div className="!flex !items-center !gap-x-1 !whitespace-nowrap !text-xs">
              <span className="!text-xs"> Powered by </span>
              <img
                src="https://bluetic-preprod.s3.ap-south-1.amazonaws.com/blutic-branding.svg"
                className="h-4.5"
              />
            </div>
          </div>
          <div className="max-md:!flex max-md:!items-center max-md:!gap-x-1 max-md:!whitespace-nowrap max-md:!text-xs max-md:w-full max-md:!justify-center md:hidden">
            <span className="!text-xs"> Powered by </span>
            <img
              src="https://bluetic-preprod.s3.ap-south-1.amazonaws.com/blutic-branding.svg"
              className="h-4.5"
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (!shouldShowBanner || !isVisible) return null;

  return (
    <>
      {!isModalOpen && bannerData && !hasSavedPreference && (
        <div
          className="fixed z-[99999] font-sans bottom-2 left-1/2 transform -translate-x-1/2 w-[90%] shadow-lg md:hidden"
          style={{ backgroundColor: bannerData.backgroundColor }}
        >
          <div className="p-6 pb-10 relative">
            <div className="flex justify-between items-center mb-2">
              <p
                className="font-semibold !text-lg"
                style={{ color: bannerData.titleColor }}
              >
                {bannerData.title}
              </p>
              <div className="text-xs border border-gray-300 bg-gray-50 text-gray-800 rounded-md px-3 py-1 flex items-center gap-1">
                English <ChevronDown size={10} />
              </div>
            </div>

            <div
              className="text-sm mb-4 leading-relaxed !max-h-20 overflow-y-auto"
              style={{ color: bannerData.descriptionColor }}
              dangerouslySetInnerHTML={{ __html: bannerData.description }}
            />

            <div className="flex items-center gap-5 text-sm mb-5">
              <a
                href={bannerData.privacyPolicy}
                target="_blank"
                rel="noopener noreferrer"
                className="!text-black !underline !opacity-75 !font-semibold hover:!opacity-100"
              >
                Privacy Policy
              </a>
              <div className="h-4 border-l border-black opacity-20" />
              <div
                onClick={() => {
                  setActiveTab("about"), setIsModalOpen(true);
                }}
                className="text-black underline opacity-75 font-semibold hover:opacity-100 hover:cursor-pointer"
              >
                What are cookies?
              </div>
            </div>

            <div className="flex flex-col gap-y-2 mb-3">
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex-1 !py-1.5 hover:cursor-pointer text-sm font-medium rounded-md border focus:!outline-none"
                style={{
                  backgroundColor: bannerData.manageButtonColor,
                  color: bannerData.manageButtonTextColor,
                  borderColor:
                    bannerData.manageButtonColor === "#ffffff" &&
                    bannerData.backgroundColor === "#ffffff" &&
                    "#000000",
                }}
              >
                {bannerData.manageButtonText}
              </button>
              <button
                disabled={loading}
                onClick={handleRejectAll}
                className="flex-1 !py-1.5 hover:cursor-pointer text-sm font-medium rounded-md border focus:!outline-none"
                style={{
                  backgroundColor: bannerData.declineButtonColor,
                  color: bannerData.declineButtonTextColor,
                  border:
                    bannerData.declineButtonColor === "#ffffff" &&
                    bannerData.backgroundColor === "#ffffff"
                      ? "1px solid #e5e7eb"
                      : "none",
                }}
              >
                {loading && "Loading..."}
                {bannerData.declineButtonText}
              </button>
              <button
                disabled={loading}
                onClick={handleAccept}
                className="flex-1 !py-1.5 hover:cursor-pointer text-sm font-medium rounded-md border-none focus:!outline-none"
                style={{
                  backgroundColor: bannerData.acceptButtonColor,
                  color: bannerData.acceptButtonTextColor,
                  border:
                    bannerData.acceptButtonColor === "#ffffff" &&
                    bannerData.backgroundColor === "#ffffff"
                      ? "1px solid #e5e7eb"
                      : "none",
                }}
              >
                {loading && "Loading..."}
                {bannerData.acceptButtonText}
              </button>
            </div>

            <div className="!flex !items-center !justify-center !gap-x-1 !text-xs !whitespace-nowrap w-full">
              <span className="text-black !text-xs"> Powered by </span>
              <img
                src="https://bluetic-preprod.s3.ap-south-1.amazonaws.com/blutic-branding.svg"
                className="h-4.5"
              />
            </div>
          </div>
        </div>
      )}
      {!isModalOpen && bannerData && !hasSavedPreference && (
        <div
          className={`max-md:hidden fixed z-[99999] font-sans ${
            bannerData.position.startsWith("bottom")
              ? bannerData.position.includes("overlay")
                ? "bottom-0 w-full shadow-lg left-0"
                : `${
                    bannerData.position === "bottom_left" ? "left-4" : "right-4"
                  } bottom-4 max-w-lg rounded-xl shadow-xl overflow-hidden`
              : bannerData.position === "overlay"
              ? "top-0 w-full shadow-lg left-0"
              : "top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 max-w-lg rounded-xl shadow-xl overflow-hidden"
          }`}
          style={{ backgroundColor: bannerData.backgroundColor }}
        >
          {(bannerData.position.startsWith("bottom") ||
            bannerData.position === "center") &&
          !bannerData.position.includes("overlay") ? (
            <div className="p-6 pb-10 relative">
              <div className="flex justify-between items-center mb-2">
                <p
                  className="font-semibold !text-xl"
                  style={{ color: bannerData.titleColor }}
                >
                  {bannerData.title}
                </p>
                <div className="text-xs border border-gray-300 bg-gray-50 text-gray-800 rounded-md px-3 py-1 flex items-center gap-1">
                  English <ChevronDown size={10} />
                </div>
              </div>

              <div
                className="text-sm mb-4 leading-relaxed !max-h-20 overflow-y-auto"
                style={{ color: bannerData.descriptionColor }}
                dangerouslySetInnerHTML={{ __html: bannerData.description }}
              />

              <div className="flex items-center gap-5 text-sm mb-5">
                <a
                  href={bannerData.privacyPolicy}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="!text-black !underline !opacity-75 !font-semibold hover:!opacity-100"
                >
                  Privacy Policy
                </a>
                <div className="h-4 border-l border-black opacity-20" />
                <div
                  onClick={() => {
                    setActiveTab("about"), setIsModalOpen(true);
                  }}
                  className="text-black underline opacity-75 font-semibold hover:opacity-100 hover:cursor-pointer"
                >
                  What are cookies?
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex-1 py-[8px] hover:cursor-pointer text-sm font-medium rounded-md border focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.manageButtonColor,
                    color: bannerData.manageButtonTextColor,
                    borderColor:
                      bannerData.manageButtonColor === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff" &&
                      "#000000",
                  }}
                >
                  {bannerData.manageButtonText}
                </button>
                <button
                  disabled={loading}
                  onClick={handleRejectAll}
                  className="flex-1 py-[8px] hover:cursor-pointer text-sm font-medium rounded-md border focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.declineButtonColor,
                    color: bannerData.declineButtonTextColor,
                    border:
                      bannerData.declineButtonColor === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff"
                        ? "1px solid #e5e7eb"
                        : "none",
                  }}
                >
                  {loading && "Loading..."}
                  {bannerData.declineButtonText}
                </button>
                <button
                  disabled={loading}
                  onClick={handleAccept}
                  className="flex-1 py-[8px] hover:cursor-pointer text-sm font-medium rounded-md border-none focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.acceptButtonColor,
                    color: bannerData.acceptButtonTextColor,
                    border:
                      bannerData.acceptButtonColor === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff"
                        ? "1px solid #e5e7eb"
                        : "none",
                  }}
                >
                  {loading && "Loading..."}
                  {bannerData.acceptButtonText}
                </button>
              </div>

              <div className="absolute bottom-3 right-6 text-gray-500">
                <div className="!flex !items-center !justify-center !gap-x-1 !text-xs !whitespace-nowrap">
                  <span className="text-black !text-xs"> Powered by </span>
                  <img
                    src="https://bluetic-preprod.s3.ap-south-1.amazonaws.com/blutic-branding.svg"
                    className="h-4.5"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center relative px-12 pt-4 pb-9">
              <div className="w-3/5">
                <div className="flex items-center mb-1 gap-4">
                  <p
                    className="!text-xl font-semibold"
                    style={{ color: bannerData.titleColor }}
                  >
                    {bannerData.title}
                  </p>
                  <div className="text-xs border border-gray-300 bg-gray-50 text-gray-800 rounded-md px-3 py-1 flex items-center gap-1">
                    English <ChevronDown size={10} />
                  </div>
                </div>

                <div
                  className="text-sm mb-3 font-medium !max-h-20 overflow-y-auto"
                  style={{ color: bannerData.descriptionColor }}
                  dangerouslySetInnerHTML={{ __html: bannerData.description }}
                />

                <div className="flex items-center gap-5 text-sm">
                  <a
                    href={bannerData.privacyPolicy}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="!text-black !underline !opacity-75 !font-semibold hover:!opacity-100"
                  >
                    Privacy Policy
                  </a>
                  <div className="h-4 border-l border-black opacity-20" />
                  <div
                    onClick={() => {
                      setActiveTab("about"), setIsModalOpen(true);
                    }}
                    className="text-black underline opacity-75 font-semibold hover:opacity-100 hover:cursor-pointer"
                  >
                    What are cookies?
                  </div>
                </div>
              </div>

              <div className="w-2/5 flex gap-x-2 justify-end items-center">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex-1 !py-[10px] hover:cursor-pointer !text-sm rounded-md border focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.manageButtonColor,
                    color: bannerData.manageButtonTextColor,
                    borderColor:
                      bannerData.manageButtonBorder === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff" &&
                      "#000000",
                  }}
                >
                  {bannerData.manageButtonText}
                </button>
                <button
                  disabled={loading}
                  onClick={handleRejectAll}
                  className="flex-1 !py-[10px] hover:cursor-pointer !text-sm rounded-md border focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.declineButtonColor,
                    color: bannerData.declineButtonTextColor,
                    border:
                      bannerData.declineButtonColor === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff"
                        ? "1px solid #e5e7eb"
                        : "none",
                  }}
                >
                  {loading && "Loading..."}
                  {bannerData.declineButtonText}
                </button>
                <button
                  disabled={loading}
                  onClick={handleAccept}
                  className="flex-1 !py-[10px] hover:cursor-pointer !text-sm rounded-md border-none focus:!outline-none"
                  style={{
                    backgroundColor: bannerData.acceptButtonColor,
                    color: bannerData.acceptButtonTextColor,
                    border:
                      bannerData.acceptButtonColor === "#ffffff" &&
                      bannerData.backgroundColor === "#ffffff"
                        ? "1px solid #e5e7eb"
                        : "none",
                  }}
                >
                  {loading && "Loading..."}
                  {bannerData.acceptButtonText}
                </button>
              </div>

              <div className="absolute bottom-2 right-11">
                <div className="!flex !items-center !justify-center !gap-x-1 !text-xs !whitespace-nowrap">
                  <span className="text-black !text-xs"> Powered by </span>
                  <img
                    src="https://bluetic-preprod.s3.ap-south-1.amazonaws.com/blutic-branding.svg"
                    className="h-4.5"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {!isModalOpen && hasSavedPreference && (
        <div
          className="fixed rounded-full hover:cursor-pointer bottom-10 left-10 !z-[99999]"
          onClick={() => setIsModalOpen(true)}
        >
          <svg
            width="96"
            height="96"
            viewBox="0 0 96 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="max-md:!w-[64px] max-md:!h-[64px]"
          >
            <g filter="url(#ez0jg1pgfa)">
              <rect
                x="6"
                y="6"
                width="80"
                height="80"
                rx="40"
                fill="url(#bzo0r7r88b)"
                shape-rendering="crispEdges"
              />
              <g clip-path="url(#r00gf1mkgc)">
                <path
                  d="M72.27 43.344c-4.773-.08-9.866-5.2-7.146-11.254-7.947 2.667-15.387-4.24-13.84-12.16-19.014-4-32.214 11.654-32.214 26.107 0 14.72 11.947 26.667 26.667 26.667 15.707 0 28.107-13.547 26.533-29.36z"
                  fill="#fff"
                />
                <g clip-path="url(#jh3f8gjozd)">
                  <path
                    d="m46.678 41.88-3.95-3.9a.43.43 0 0 0-.601 0l-3.95 3.9a.416.416 0 0 0 0 .595l3.95 3.9a.43.43 0 0 0 .602 0l3.95-3.9a.416.416 0 0 0 0-.594z"
                    fill="url(#dv7aqb22we)"
                  />
                  <path
                    d="m47.892 58.152.828-.817L35.925 44.7a.43.43 0 0 0-.601 0l-5.7 5.628a.417.417 0 0 0 0 .594l7.322 7.23c.226.223.531.347.85.347h9.245c.319 0 .625-.124.85-.348v.001z"
                    fill="url(#b9gxfjod9f)"
                  />
                  <path
                    d="m47.886 58.152 14.488-14.306a.417.417 0 0 0 0-.594l-5.7-5.628a.43.43 0 0 0-.601 0l-19.962 19.71.829.817c.226.224.532.349.85.349h9.245c.319 0 .626-.125.85-.349v.001z"
                    fill="url(#rwjv4b0eug)"
                  />
                </g>
                <path
                  d="M62.252 27.535c.575 1.56 3.037.653 2.463-.907-.575-1.56-3.037-.652-2.463.907zM72.076 25.268c-.877-2.38-4.571-1.02-3.694 1.36.876 2.38 4.57 1.02 3.694-1.36zM72.852 32.44c-.574-1.56-3.037-.653-2.462.907.574 1.56 3.037.652 2.462-.907z"
                  fill="#fff"
                />
              </g>
            </g>
            <defs>
              <linearGradient
                id="bzo0r7r88b"
                x1="81.387"
                y1="13.312"
                x2="-3.87"
                y2="78.798"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#2065F5" />
                <stop offset="1" stop-color="#6DBDFF" />
              </linearGradient>
              <linearGradient
                id="dv7aqb22we"
                x1="42.427"
                y1="48.764"
                x2="42.427"
                y2="32.096"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#2065F5" />
                <stop offset="1" stop-color="#6DBDFF" />
              </linearGradient>
              <linearGradient
                id="b9gxfjod9f"
                x1="41.462"
                y1="56.009"
                x2="27.682"
                y2="43.126"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#2065F5" />
                <stop offset="1" stop-color="#6DBDFF" />
              </linearGradient>
              <linearGradient
                id="rwjv4b0eug"
                x1="60.977"
                y1="39.42"
                x2="37.829"
                y2="61.762"
                gradientUnits="userSpaceOnUse"
              >
                <stop stop-color="#2065F5" />
                <stop offset="1" stop-color="#6DBDFF" />
              </linearGradient>
              <clipPath id="r00gf1mkgc">
                <path
                  fill="#fff"
                  transform="translate(19 19)"
                  d="M0 0h54v54H0z"
                />
              </clipPath>
              <clipPath id="jh3f8gjozd">
                <path
                  fill="#fff"
                  transform="translate(29.5 37.5)"
                  d="M0 0h33v21H0z"
                />
              </clipPath>
              <filter
                id="ez0jg1pgfa"
                x="0"
                y="0"
                width="96"
                height="96"
                filterUnits="userSpaceOnUse"
                color-interpolation-filters="sRGB"
              >
                <feFlood flood-opacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset dx="2" dy="2" />
                <feGaussianBlur stdDeviation="4" />
                <feComposite in2="hardAlpha" operator="out" />
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.2 0" />
                <feBlend
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_1351_35532"
                />
                <feBlend
                  in="SourceGraphic"
                  in2="effect1_dropShadow_1351_35532"
                  result="shape"
                />
              </filter>
            </defs>
          </svg>
        </div>
      )}
      {isModalOpen && <Modal />}
    </>
  );
};

export default CookieBanner;
