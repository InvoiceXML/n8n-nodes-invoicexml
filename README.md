# @invoicexml/n8n-nodes-invoicexml

This is an n8n community node for [InvoiceXML](https://www.invoicexml.com), the e-invoicing API for Europe. It creates, validates and converts EN 16931 e-invoices in XRechnung, ZUGFeRD, Factur-X, UBL / Peppol BIS and CII, right inside your n8n workflows. Every invoice is validated against the official rules before it is returned.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) ·
[Operations](#operations) ·
[Credentials](#credentials) ·
[Usage](#usage) ·
[Compatibility](#compatibility) ·
[Resources](#resources) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `@invoicexml/n8n-nodes-invoicexml`.

## Operations

The **InvoiceXML** node has one resource, **Invoice**, with five operations:

| Operation | What it does |
|---|---|
| **Create** | Builds a validated e-invoice file from invoice JSON with the [e-invoice creation API](https://www.invoicexml.com/api/create). Choose XRechnung, ZUGFeRD, Factur-X, UBL / Peppol BIS or CII. The file is returned as binary data. |
| **Validate** | Checks an e-invoice file with the [e-invoice validation API](https://www.invoicexml.com/api/validate) and returns `valid`, the error and warning counts and every finding with its rule and message. |
| **Convert** | Converts an e-invoice file to another format with the [e-invoice conversion API](https://www.invoicexml.com/api/convert), for example UBL to ZUGFeRD or Factur-X to CII. |
| **Extract Data** | Reads the invoice data embedded in a ZUGFeRD or Factur-X PDF with the [invoice data extraction API](https://www.invoicexml.com/api/extract/json) and returns it as JSON. |
| **Render as PDF** | Turns an XRechnung, UBL or CII invoice XML into a readable PDF in English, German or French ([render API reference](https://www.invoicexml.com/docs/api/render/xml/to/pdf)). |

Validate, Convert, Extract Data and Render as PDF read the invoice file from a binary field of the incoming item (`data` by default). Create, Convert and Render as PDF return the new file in the `data` binary field.

## Credentials

You need an InvoiceXML API key:

1. Sign up or log in at [www.invoicexml.com](https://www.invoicexml.com/account/signup).
2. Open **Account > Authentication** and copy your API key.
3. In n8n, create an **InvoiceXML API** credential and paste the key.

n8n checks the key when you save the credential.

## Usage

**Create an XRechnung from your order data.** Put a Code or Set node before the InvoiceXML node that builds the invoice JSON, then map it into the **Invoice** field of the Create operation. The node's default value is a complete example to start from. All invoice fields are described in the [InvoiceXML API documentation](https://www.invoicexml.com/docs).

**Check incoming invoices.** Use an email or cloud storage trigger that delivers the invoice file as binary data, then the Validate operation. Route on the `valid` field with an If node.

**Book a received ZUGFeRD PDF.** Use Extract Data on the PDF and map the returned seller, totals and lines into your accounting system.

When the API rejects an invoice, the node error shows the API message and every validation finding, so you can see which field to fix.

## Compatibility

Built with the `@n8n/node-cli` tooling (n8n nodes API version 1). Works with current n8n versions, on n8n Cloud and self-hosted.

## Resources

- [InvoiceXML](https://www.invoicexml.com)
- [InvoiceXML API documentation](https://www.invoicexml.com/docs)
- [E-invoicing with n8n](https://www.invoicexml.com/blog/n8n-e-invoicing)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
