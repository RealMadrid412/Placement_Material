#!/usr/bin/env python3
"""Convert Item_PerformanceReport in the Walmart V3 DSS from full load to incremental.

Usage:
    python3 patch_dss.py <input_dss.json> <output_dss.json>

Only the Item_PerformanceReport table is touched. Everything else in the DSS
(including the other tables' templates, auth headers and action scripts) is
written back unchanged. The table's `entitySourceTemplate` is a JSON string
inside the DSS, so it is decoded, patched and re-encoded here rather than
edited by hand.
"""
import json
import sys

TABLE = "Item_PerformanceReport"
DIMENSION = "date"

# Walmart ITEM_PERFORMANCE v3 accepts at most 15 days per DAILY request.
# The enumerator range is inclusive of both dates (the end is sent as
# T23:59:59), so partitionSize N covers N+1 calendar days. 9 -> 10-day windows.
PARTITION_DAYS = "9"

HIST_PLACEHOLDER = "<<$.start_date_date1_hist_strategy>>"


def patch_source_log_state(tpl):
    tpl["initialSyncSourceLogState"]["dimensionEnumeratorsState"][DIMENSION] = {
        "dimensionName": DIMENSION,
        "dimensionEnumeratorType": "RANGE_DIMENSION_ENUMERATOR",
        "backingEntitySourceState": {},
        "lowerBoundEntity": {DIMENSION: HIST_PLACEHOLDER},
    }


def date_range_enumerator():
    return {
        "dimensionEnumeratorType": "RANGE_DIMENSION_ENUMERATOR",
        "params": {
            "dimensionName": DIMENSION,
            "initialSyncLowerBoundEntity": {DIMENSION: HIST_PLACEHOLDER},
            "dimensionSource": {
                "entitySourceType": "DATE_ENTITY_SOURCE",
                "params": {
                    "datePattern": "yyyy-MM-dd",
                    "zoneId": "UTC",
                    # Walmart's current day is incomplete; stop at yesterday.
                    "timeLag": "1",
                    "entitySourceName": "range",
                },
            },
            "rangePartitionStrategyType": "FIXED_PARTITION_SIZE_PARTITION_STRATEGY",
            "rangePartitionStrategyMetadata": {
                "partitionSize": PARTITION_DAYS,
                # 0 re-pulls the last (complete) day on the next sync, same as
                # Item_Report. Use "1" to never overlap (Append mode), or a
                # negative number for a restatement lookback (Upsert only).
                "skipValueForEntityToSaveInSourceLog": "0",
                # Both bounds are inclusive days, so the next window starts the
                # day after the previous upper bound: no gap, no overlap.
                "skipValueForMinEntityOfNextPartition": "1",
            },
        },
    }


def patch_create_report(params):
    api = next(a for a in params["constituentApis"] if a["id"] == "create_report_api")
    api["queryParams"]["reportVersion"] = "v3"
    api["headerParams"]["Content-Type"] = "application/json"
    api["requestBody"] = {
        "dataStartTime": "{{$.%s.lowerBound.%s}}T00:00:00.000Z" % (DIMENSION, DIMENSION),
        "dataEndTime": "{{$.%s.upperBound.%s}}T23:59:59.000Z" % (DIMENSION, DIMENSION),
        "dateGranularity": "DAILY",
    }
    api["requestBodyType"] = "RAW"


def main(src, dst):
    with open(src, encoding="utf-8") as f:
        dss = json.load(f)

    flagged = [t for t in dss["initialVariablePool"]["tables_select"] if t["name"] == TABLE]
    table = next(t for t in dss["extraConfig"]["tables"] if t["name"] == TABLE)
    if len(flagged) != 1:
        sys.exit(f"{TABLE} not found exactly once in tables_select")

    flagged[0]["isFullLoadSupported"] = False
    table["isFullLoadSupported"] = False

    tpl = json.loads(table["entitySourceTemplate"])
    params = tpl["params"]
    patch_source_log_state(tpl)
    params["memoryEfficientDimensionName"] = DIMENSION
    params["dimensionEnumerators"] = [date_range_enumerator()]
    patch_create_report(params)
    table["entitySourceTemplate"] = json.dumps(tpl, separators=(",", ":"), ensure_ascii=False)

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(dss, f, separators=(",", ":"), ensure_ascii=False)
    print(f"Patched {TABLE}: incremental on '{DIMENSION}', create-report v3 -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
