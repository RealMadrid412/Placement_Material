# SkuVault PO_Details: API reference

Tokens redacted (`/api/gettokens` returns them).

## Calls and responses (window 2026-06-01 to 2026-06-30)

| # | PageNumber | IncludeProducts | Result |
|---|---|---|---|
| 1 | 0 | false | 16 POs, 1,976 line items, `"Products": null` (`sample_getPOs_IncludeProducts_false.json`) |
| 2 | 1 | false | `{"PurchaseOrders": [], "Products": null}` |
| 3 | 0 | true | same 16 POs plus 1,915 product records in `Products` (duplicate of Product_Details) |
| 4 | 1 | true | `{"PurchaseOrders": [], "Products": []}` |

### 1st call
```bash
curl --location 'https://app.skuvault.com/api/purchaseorders/getPOs' \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--data '{
  "ModifiedAfterDateTimeUtc": "2026-06-01T00:00:00.0000000Z",
  "ModifiedBeforeDateTimeUtc": "2026-06-30T00:00:00.0000000Z",
  "Status": "Everything except Completed",
  "PageNumber": 0,
  "PageSize": 1000,
  "IncludeProducts": false,
  "TenantToken": "<TenantToken>",
  "UserToken": "<UserToken>"
}'
```
### 2nd call (page past the end)
```bash
curl --location 'https://app.skuvault.com/api/purchaseorders/getPOs' \
--header 'accept: application/json' \
--header 'content-type: application/json' \
--data '{
  "ModifiedAfterDateTimeUtc": "2026-06-01T00:00:00.0000000Z",
  "ModifiedBeforeDateTimeUtc": "2026-06-30T00:00:00.0000000Z",
  "Status": "Everything except Completed",
  "PageNumber": 1,
  "PageSize": 1000,
  "IncludeProducts": false,
  "TenantToken": "<TenantToken>",
  "UserToken": "<UserToken>"
}'
```
Response: `{"PurchaseOrders": [], "Products": null}`

### 3rd / 4th calls
Same as above with `"IncludeProducts": true`. Not used by the connector: `Products` repeats Product_Details and adds about 1.2 MB per window of that data.

### Response sample (1st call, trimmed to 2 line items)
```json
{
  "PurchaseOrders": [
    {
      "PoId": "395834",
      "PoNumber": "PBX060826",
      "Status": "NoneReceived",
      "PaymentStatus": "NonePaid",
      "SentStatus": "NotSent",
      "SupplierName": "PBX - Ming",
      "CreatedDate": "2026-06-08T17:02:53.0475770Z",
      "OrderDate": "2026-06-08T04:00:00.0000000Z",
      "OrderCancelDate": "2026-07-01T04:00:00.0000000Z",
      "ArrivalDueDate": "2026-07-01T04:00:00.0000000Z",
      "RequestedShipDate": "2026-06-24T04:00:00.0000000Z",
      "ActualShippedDate": "0001-01-01T00:00:00.0000000Z",
      "TrackingInfo": "",
      "PublicNotes": "",
      "PrivateNotes": "",
      "TermsName": "",
      "ShipToWarehouse": "NY",
      "ShipToAddress": "North Bergen Office",
      "ShippingCarrierClass": {
        "CarrierName": "",
        "ClassName": ""
      },
      "Costs": [],
      "LineItems": [
        {
          "ProductId": "2250229",
          "SKU": "PBX-UEC-003-SET-AZ",
          "Quantity": 20,
          "QuantityTo3PL": 0,
          "ReceivedQuantity": 0,
          "ReceivedQuantityTo3PL": 0,
          "ReceivedDate": null,
          "Cost": 9.88,
          "RetailCost": 0.0,
          "PrivateNotes": "",
          "PublicNotes": "",
          "Variant": "",
          "Identifier": ""
        },
        {
          "ProductId": "2250227",
          "SKU": "PBX-UEC-001-AZ",
          "Quantity": 20,
          "QuantityTo3PL": 0,
          "ReceivedQuantity": 0,
          "ReceivedQuantityTo3PL": 0,
          "ReceivedDate": null,
          "Cost": 6.81,
          "RetailCost": 0.0,
          "PrivateNotes": "",
          "PublicNotes": "",
          "Variant": "",
          "Identifier": ""
        }
      ]
    }
  ],
  "Products": null
}
```

## Changes to PO_Details
- Request now windowed by `ModifiedAfterDateTimeUtc` / `ModifiedBeforeDateTimeUtc` (7-day partitions from the Replication Start Date), `Status: "Everything except Completed"`, `PageNumber`/`PageSize 1000`, `IncludeProducts: false`.
- Pagination `PAGE_BASED` (start 0). Action script ends on an empty or short page.
- `PoId` is now the primary key. Added `LineItems.ReceivedDate` (TIMESTAMP, null in the sample). `maxSize` values raised to fit real data.
- Action script: added 429 (X-RateLimit-Reset), 401 and 5xx retry limits, errors-inside-200 detection, `EndPagination` instead of `NextPageCall`.
- Auth body type set to RAW (JSON), matching the Content-Type header.

Files: `PO_Details_table.json` (replace the `PO_Details` entry in `extraConfig.tables`), `PO_Details_entitySourceTemplate.json` (readable copy), `po_details_action_script.js` / `.b64`.

## Single template with both conditions (IncludeProducts true)
`PO_Details_With_Products_table.json`: one template, `IncludeProducts:true`, extraction selects `PurchaseOrders` and `Products` without decomposing. One row per week window and page, with both as nested repeated records (no `PoId` key; use UNNEST). Uses the same action script. `PO_Details_table.json` (normalized, one row per PO) is unchanged. Sample: `sample_getPOs_IncludeProducts_true.json`.

## Both conditions in one template
`PO_Details_Combined_table.json`: for each week window, calls getPOs with `IncludeProducts` = false, then true (`include_products` parent dimension, inner to the date range). Each row carries an `IncludeProducts` BOOLEAN column; false rows have `Products` null. Same nested `PurchaseOrders`/`Products` shape as `PO_Details_With_Products`, so PO data is stored twice per window.

## PO_Details_Completed
Same changes with `Status: "Completed"`: `PO_Details_Completed_table.json` (normalized, IncludeProducts false) and `PO_Details_Completed_Combined_table.json` (false/true enumerator). `entitySourceName` is now `PO_Details_Completed` (was `PO_Details`). Completed samples show `LineItems.ReceivedDate` populated (e.g. `2026-06-25T00:00:00.0000000Z`), which confirms the TIMESTAMP column. Samples: `sample_getPOs_Completed_IncludeProducts_{false,true}.json`.

## Flat templates (no UNNEST)
`PO_Details_Flat_table.json` and `PO_Details_Completed_Flat_table.json`: one row per PO line item with PO header, carrier, and line fields as typed top-level columns (34 columns). `IncludeProducts:false` (the true response has the same PO data). PO-level `PrivateNotes`/`PublicNotes` are renamed `PoPrivateNotes`/`PoPublicNotes` (the line items have columns with the same names), and PO-level `Costs` is stored as JSON text in `PoCosts`. Primary key: PoId + ProductId + Variant + Identifier.

## Flat products (IncludeProducts true)
`PO_Products_Flat_table.json` / `PO_Products_Completed_Flat_table.json`: `IncludeProducts:true`, extraction selects `Products`, one row per product (43 columns, primary key `Id`). `Attributes`, `SupplierInfo`, `Pictures`, `Statuses` are stored as JSON text so the table stays flat. Join to the flat PO tables on `ProductId = Id`. A product repeats across windows, so use upsert.
