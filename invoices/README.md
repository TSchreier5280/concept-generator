# Schreier Group — Invoices

`invoice.html` is a self-contained, print-ready invoice in the Schreier Group
design system. It is reusable for any client.

## How to use

1. Copy `invoice.html` to a new file (e.g. `2026-09-aimee-dfd.html`).
2. Edit the `INVOICE` object at the bottom of the file — that block is the only
   thing you touch. Everything on the page renders from it.
3. Open in a browser and **Print → Save as PDF** (Letter, background graphics on)
   to get the file you email to the client.

## The data block

| Field | Notes |
|---|---|
| `number`, `issued`, `due`, `terms` | Invoice header details |
| `client` | Name, business, address, email — appears in "Billed to" |
| `oneTime[]` | One-time line items (`name`, `desc`, `amount`) |
| `discount` | `label`, `amount`, and `appliesTo`: `"oneTime"` or `"recurring"` |
| `recurring[]` | Monthly line items |
| `recurringNote` | Small text at the top-right of the recurring section |
| `termList[]` | Bulleted terms |

Totals, the discount line, and the first-year summary are all calculated —
don't hand-enter them.

## Current invoice

`invoice.html` is set up as the Aimee Digital Front Door + Strategic Advisory
invoice: $3,500 build less the $300 "GO GRIZ" code = **$3,200 due now**, then
**$1,800/month** ($300 hosting + $1,500 advisory).
