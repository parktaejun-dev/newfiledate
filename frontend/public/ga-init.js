// Google Analytics 4 bootstrap.
//
// This lives in its own file rather than inline in index.html so the Content
// Security Policy can drop 'unsafe-inline' from script-src. dataLayer is a
// queue, so ordering against the async gtag.js loader does not matter.
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;

gtag('js', new Date());
gtag('config', 'G-EW7NH9LPSP', {
  send_page_view: true,
  anonymize_ip: true,
});
