// Affiliate recommendations — fill in your links to activate; empty = block stays hidden.
// Sign up (both approve individuals):
//   Pipedrive: https://www.pipedrive.com/en/partners/affiliate-program  (~33% recurring, 1yr)
//   HubSpot:   https://www.hubspot.com/partners/affiliates              (30% recurring, 180-day cookie)
window.CLOSECALC_AFFILIATES = {
  pipedrive: "",  // e.g. "https://aff.trypipedrive.com/XXXX"
  hubspot: "",    // e.g. "https://hubspot.sjv.io/XXXX"
};
(function () {
  var a = window.CLOSECALC_AFFILIATES || {};
  var items = [];
  if (a.pipedrive) items.push('<a href="' + a.pipedrive + '" rel="sponsored noopener" target="_blank">Pipedrive</a> — pipeline-first CRM; free trial, plans from $14/seat.');
  if (a.hubspot) items.push('<a href="' + a.hubspot + '" rel="sponsored noopener" target="_blank">HubSpot Sales Hub</a> — start on the free CRM, upgrade when the team grows.');
  if (!items.length) return;
  var el = document.getElementById('aff-reco');
  if (!el) return;
  el.innerHTML = '<b>Fix the number you just calculated</b>' +
    '<ul style="margin:8px 0 4px;padding-left:20px">' + items.map(function (i) { return '<li style="margin:4px 0">' + i + '</li>'; }).join('') + '</ul>' +
    '<div style="font-size:11px;opacity:.65">Affiliate links — no extra cost to you; they keep these calculators free.</div>';
  el.style.display = 'block';
})();
