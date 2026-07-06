export function shouldRenderGtm(gtmId: string | undefined): boolean {
  return Boolean(gtmId);
}
export function buildGtmSrc(gtmId: string): string {
  return `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
}

/**
 * Returns the inline script that initialises window.dataLayer and pushes the
 * GTM bootstrap event. Placed in <head> before the container script so that
 * Google Tag Assistant detects a correctly installed container.
 */
export function buildGtmDataLayerScript(gtmId: string): string {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`;
}
