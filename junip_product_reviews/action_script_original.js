if (currentSyncStats.getMilliSecondsElapsedFromSyncStart() > 1800000) {
    new HibernateAndRetry(0, new LoggingConfiguration(false, false));
} else {
    if (apiOutput.responseCode == 200) {
        var body = apiOutput.responseBody;
        var hasData = (body != null) && (body.data != null) && (body.data.length > 0);
        var hasNext = hasData && (body.meta != null) && (body.meta.after != null) && (body.meta.after !== "");
        if (!hasData) {
            // Empty page: nothing to extract, stop paginating
            new EndPagination(false, new LoggingConfiguration(true, false));
        } else if (!hasNext) {
            // meta.after is null/missing: last page. Extract this page, then end pagination
            new EndPagination(true, new LoggingConfiguration(true, false));
        } else {
            new SleepAndNextPageCall(6000, new LoggingConfiguration(true, true));
        }
    } else if (apiOutput.responseCode == 404) {
        new EndPagination(false, new LoggingConfiguration(true, false));
    } else if (apiOutput.responseCode == 429) {
        var retryAfter = Number(apiOutput.responseHeaders["retry-after"]);
        new SleepAndRetry((isNaN(retryAfter) || retryAfter <= 0 ? 60 : retryAfter) * 1000, new LoggingConfiguration(true, true));
    } else if ((apiOutput.responseCode == 401) || (apiOutput.responseCode == 403)) {
        new ThrowException("Error Code - " + apiOutput.responseCode + " " + JSON.stringify(apiOutput.responseBody), new LoggingConfiguration(true, true));
    } else if ((apiOutput.responseCode == 500) || (apiOutput.responseCode == 501) || (apiOutput.responseCode == 502) || (apiOutput.responseCode == 503) || (apiOutput.responseCode == 504) || (apiOutput.responseCode == 409)) {
        new SleepAndRetry(60000, new LoggingConfiguration(true, true));
    } else {
        new ThrowException("Error Code - " + apiOutput.responseCode + " " + JSON.stringify(apiOutput.responseBody), new LoggingConfiguration(true, true));
    }
}