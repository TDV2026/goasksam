// Outbound submission URLs (server source of truth, Part 6). A slug appearing
// here does NOT make a platform recommendable: only rankable platforms render an
// outbound button. Car & Classic and Collecting Cars are not OldCarsData-covered
// (evidenceCapable:false), so they never surface as a pick/alt card and never get
// a button, even though their submit URLs are configured here for completeness.
// api/out.js 302s to these; the frontend mirrors this map (js/result-copy.js) to
// gate the button and label the modal. Keep the two in sync.
export const SUBMISSION_URLS = {
  bringatrailer: "https://bringatrailer.com/submit-a-vehicle/",
  carsandbids: "https://carsandbids.com/sell-car/",
  hagerty: "https://www.hagerty.com/marketplace/sell",
  pcarmarket: "https://www.pcarmarket.com/submit-your-listing",
  sothebysmotorsport: "https://sothebysmotorsport.com/sell",
  autohunter: "https://autohunter.com/sell-your-vehicle",
  hemmings: "https://www.hemmings.com/classifieds/bundles/carsforsale",
  carandclassic: "https://www.carandclassic.com/sell-your-vehicle",
  collectingcars: "https://collectingcars.com/sell-with-us"
};

// Referral UTMs are opaque only: no email, no user id, no session id ever goes to
// the destination platform (Part 6.4). The click row (api/out.js) carries the
// context; the platform sees only these three fixed campaign tags.
export const REFERRAL_UTM = "utm_source=goasksam&utm_medium=referral&utm_campaign=seller_recommendation";
