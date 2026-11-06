if (currentSyncStats.getMilliSecondsElapsedFromSyncStart() > 1800000) {
    new HibernateAndRetry(0, new LoggingConfiguration(true, true));
} else if (apiOutput.responseCode == 200) {
    var items = apiOutput.responseBody.Quantities;
    if (items == null || items.length == 0) {
        new EndPagination(false, new LoggingConfiguration(true, true));
    } else {
        new SleepAndNextPageCall(0, new LoggingConfiguration(true, true));
    }
} else if (apiOutput.responseCode == 429) {
    new SleepAndRetry(60000, new LoggingConfiguration(true, true));
} else if (apiOutput.responseCode == 401) {
    if (numberOfTimesRetriedAlready >= 2) {
        new ThrowException("Unauthorized - Invalid Credentials", new LoggingConfiguration(true, true));
    } else {
        new SleepAndRetry(5000, new LoggingConfiguration(true, true));
    }
} else if (apiOutput.responseCode == 500 || apiOutput.responseCode == 503 || apiOutput.responseCode == 504) {
    if (numberOfTimesRetriedAlready >= 6) {
        new ThrowException("Giving up after retries. responseCode=" + apiOutput.responseCode, new LoggingConfiguration(true, true));
    } else {
        new SleepAndRetry(60000, new LoggingConfiguration(true, true));
    }
} else {
    new ThrowException("ERROR CALLING API responseCode=" + apiOutput.responseCode, new LoggingConfiguration(true, true));
}
