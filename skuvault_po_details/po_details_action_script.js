// SkuVault /api/purchaseorders/getPOs action script (PO_Details table)
// Page-based (PageNumber starts at 0), windowed by ModifiedAfter/BeforeDateTimeUtc.
// 200 body: {"PurchaseOrders":[...],"Products":null|[...]}. A page past the end returns "PurchaseOrders":[].
// Empty/short page = last page. Throttling: 429 + X-RateLimit-Reset (ms to wait).

var PACE_MS = 0;
var HIBERNATE_AFTER_MS = 1800000;   // 30 min
var DEFAULT_PAGE_SIZE = 1000;
var MAX_RETRIES = 6;

function header(name) {
  var headers = apiOutput.responseHeaders;
  if (!headers) return null;
  for (var k in headers) {
    if (String(k).toLowerCase() == name) {
      var v = headers[k];
      if (v != null && typeof v == "object" && v.length != undefined) v = v[0];
      return v;
    }
  }
  return null;
}

function resetWaitMs(fallbackMs) {
  var reset = Number(header("x-ratelimit-reset"));
  return (reset > 0) ? Math.min(reset + 1000, 300000) : fallbackMs;
}

// responseBody is a host object; read it defensively
function sizeOf(o) {
  if (o == null) return 0;
  try { if (typeof o.size == "function") return o.size(); } catch (e) {}
  try { if (typeof o.length == "number") return o.length; } catch (e) {}
  try { return Object.keys(o).length; } catch (e) {}
  return -1;
}

function sourceError() {
  var body = apiOutput.responseBody;
  if (body == null) return "<empty body>";
  try {
    var errs = body.Errors;
    if (errs != null && sizeOf(errs) > 0) {
      var parts = [];
      for (var i = 0; i < sizeOf(errs); i++) {
        var e = errs[i];
        parts.push((e.ErrorCode ? e.ErrorCode + ": " : "") + (e.Message || e.ErrorMessage || String(e)));
      }
      return parts.join("; ");
    }
    if (body.Message) return String(body.Message);
  } catch (ex) {}
  return null;
}

function requestPageSize() {
  try {
    var b = apiInput != null ? apiInput.requestBody : null;
    if (b != null && typeof b == "string") b = JSON.parse(b);
    var n = (b != null) ? Number(b.PageSize) : NaN;
    if (n > 0) return n;
  } catch (ex) {}
  return DEFAULT_PAGE_SIZE;
}

var action;
var code = apiOutput.responseCode;

if (currentSyncStats.getMilliSecondsElapsedFromSyncStart() > HIBERNATE_AFTER_MS) {
  action = new HibernateAndRetry(0, new LoggingConfiguration(false, false));
} else if (code == 200) {
  var err = sourceError();
  if (err != null) {
    // errors can arrive inside a 200; fail loudly so the window is not advanced
    action = new ThrowException("SkuVault getPOs returned errors with responseCode=200: " + err, new LoggingConfiguration(true, true));
  } else {
    var count = sizeOf(apiOutput.responseBody != null ? apiOutput.responseBody.PurchaseOrders : null);
    if (count == 0) {
      action = new EndPagination(false, new LoggingConfiguration(true, false));
    } else if (count > 0 && count < requestPageSize()) {
      action = new EndPagination(true, new LoggingConfiguration(true, false));
    } else {
      action = new SleepAndNextPageCall(PACE_MS, new LoggingConfiguration(true, false));
    }
  }
} else if (code == 429) {
  action = new SleepAndRetry(resetWaitMs(60000 * Math.pow(2, Math.min(numberOfTimesRetriedAlready, 3))), new LoggingConfiguration(true, true));
} else if (code == 401) {
  // retry refreshes the auth context (new UserToken/TenantToken)
  if (numberOfTimesRetriedAlready >= 2) {
    action = new ThrowException("SkuVault authentication failed (401) after retries. " + (sourceError() || ""), new LoggingConfiguration(true, true));
  } else {
    action = new SleepAndRetry(5000, new LoggingConfiguration(true, true));
  }
} else if (code >= 500 && code < 600) {
  if (numberOfTimesRetriedAlready >= MAX_RETRIES) {
    action = new ThrowException("Giving up after " + numberOfTimesRetriedAlready + " retries. Last responseCode=" + code + " " + (sourceError() || ""), new LoggingConfiguration(true, true));
  } else {
    action = new SleepAndRetry(60000, new LoggingConfiguration(true, true));
  }
} else {
  action = new ThrowException("ERROR CALLING getPOs responseCode=" + code + " " + (sourceError() || ""), new LoggingConfiguration(true, true));
}

action;
