/* E85 Blend Lab — Google Analytics 4.
   Lives in its own same-origin file because the CSP forbids inline scripts.
   Loads gtag.js async; fails silently offline (the SW never caches
   cross-origin, so no stale analytics either). */
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag("js", new Date());
gtag("config", "G-BTQMP06LL3");

(function () {
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=G-BTQMP06LL3";
  document.head.appendChild(s);
})();
