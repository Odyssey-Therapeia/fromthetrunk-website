import { CONSENT_COOKIE } from "@/lib/analytics/consent";

export const CONSENT_DATA_ATTRIBUTE = "data-ftt-analytics-consent";

export const CONSENT_BOOTSTRAP_SOURCE = `(function(){try{var m=document.cookie.split('; ').find(function(row){return row.indexOf('${CONSENT_COOKIE}=')===0});var v=m?decodeURIComponent(m.split('=')[1]||''):'unknown';document.documentElement.setAttribute('${CONSENT_DATA_ATTRIBUTE}',v==='granted'||v==='denied'?v:'unknown')}catch(e){document.documentElement.setAttribute('${CONSENT_DATA_ATTRIBUTE}','unknown')}})();`;

/**
 * Runs in the parser-blocking head so a stored decision is reflected before the
 * consent banner can paint. It reads no request API and keeps the layout static.
 */
export function ConsentBootstrapScript() {
  return (
    <script
      id="ftt-consent-bootstrap"
      dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP_SOURCE }}
    />
  );
}
