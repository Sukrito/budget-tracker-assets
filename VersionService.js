/*******************************************************
 * Personal AI Finance OS v12.9 Split Backend
 * File: VersionService.gs
 * Google Apps Script shares global scope across .gs files.
 *******************************************************/

function getVersionInfo_() {
  return {
    app: APP_META.NAME,
    backendVersion: APP_META.BACKEND_VERSION,
    backendLabel: APP_META.BACKEND_LABEL,
    expectedFrontendVersion: APP_META.FRONTEND_EXPECTED_VERSION,
    releaseDate: APP_META.RELEASE_DATE,
    buildChannel: APP_META.BUILD_CHANNEL,
    timezone: APP_CONFIG.TIMEZONE,
    cacheKey: API_SECURITY.SUMMARY_CACHE_KEY,
    cacheSeconds: API_SECURITY.SUMMARY_CACHE_SECONDS
  };
}
