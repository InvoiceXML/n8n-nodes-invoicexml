import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { flattenFindings, invoiceXmlRequest, outputFileName, parseJson } from './GenericFunctions';

// Programmatic style: every operation except Create uploads the invoice from the item's
// binary data as multipart/form-data, and Create, Convert and Render return a file that
// has to be stored as binary data. Declarative routing can express neither.

type Format = 'cii' | 'facturx' | 'ubl' | 'xrechnung' | 'zugferd';

const PDF_FORMATS: string[] = ['facturx', 'zugferd'];

const extensionOf = (format: string) => (PDF_FORMATS.includes(format) ? 'pdf' : 'xml');
const mimeTypeOf = (extension: string) =>
	extension === 'pdf' ? 'application/pdf' : 'application/xml';

const FORMAT_OPTIONS: Array<{ name: string; value: Format }> = [
	{ name: 'CII (XML)', value: 'cii' },
	{ name: 'Factur-X (PDF)', value: 'facturx' },
	{ name: 'UBL / Peppol BIS (XML)', value: 'ubl' },
	{ name: 'XRechnung (XML)', value: 'xrechnung' },
	{ name: 'ZUGFeRD (PDF)', value: 'zugferd' },
];

const FORMAT_NAMES: Record<Format, string> = {
	cii: 'CII',
	facturx: 'Factur-X',
	ubl: 'UBL',
	xrechnung: 'XRechnung',
	zugferd: 'ZUGFeRD',
};

// Every format pair the API converts between.
const CONVERSIONS: Array<[Format, Format]> = [
	['cii', 'facturx'],
	['cii', 'ubl'],
	['cii', 'xrechnung'],
	['cii', 'zugferd'],
	['facturx', 'cii'],
	['facturx', 'ubl'],
	['ubl', 'cii'],
	['ubl', 'facturx'],
	['ubl', 'xrechnung'],
	['ubl', 'zugferd'],
	['xrechnung', 'cii'],
	['xrechnung', 'facturx'],
	['xrechnung', 'ubl'],
	['xrechnung', 'zugferd'],
	['zugferd', 'cii'],
	['zugferd', 'ubl'],
];

// A complete invoice that passes every format, XRechnung and Peppol BIS included: a buyer
// reference (the Leitweg-ID for German public buyers), electronic addresses on both
// parties and the seller contact.
const EXAMPLE_INVOICE = {
	invoiceNumber: 'INV-2026-00045',
	issueDate: '2026-05-17',
	currency: 'EUR',
	buyerReference: '991-12345-67',
	seller: {
		name: 'Acme GmbH',
		vatIdentifier: 'DE123456789',
		legalRegistration: { identifier: 'HRB 12345' },
		postalAddress: { line1: 'Hauptstraße 12', city: 'Berlin', postCode: '10115', country: 'DE' },
		contact: { name: 'Max Mustermann', phone: '+49 30 12345678', email: 'billing@acme.de' },
		electronicAddress: { identifier: 'DE123456789', schemeId: '9930' },
	},
	buyer: {
		name: 'Bundesamt für Musterverwaltung',
		postalAddress: { line1: 'Behördenstraße 5', city: 'Bonn', postCode: '53113', country: 'DE' },
		electronicAddress: { identifier: '991-12345-67', schemeId: '0204' },
	},
	invoicingPeriod: { startDate: '2026-05-01', endDate: '2026-05-31' },
	paymentDetails: { paymentAccountIdentifier: 'DE89370400440532013000' },
	lines: [
		{
			quantity: 10,
			priceDetails: { netPrice: 150.0 },
			vatInformation: { rate: 19.0 },
			item: { name: 'Senior consulting' },
		},
	],
};

export class InvoiceXml implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'InvoiceXML',
		name: 'invoiceXml',
		icon: { light: 'file:invoicexml.svg', dark: 'file:invoicexml.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Create, validate and convert e-invoices: XRechnung, ZUGFeRD, Factur-X, UBL / Peppol BIS and CII',
		defaults: {
			name: 'InvoiceXML',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'invoiceXmlApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Invoice', value: 'invoice' }],
				default: 'invoice',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['invoice'] } },
				options: [
					{
						name: 'Convert',
						value: 'convert',
						description: 'Convert an e-invoice file to another format',
						action: 'Convert an invoice',
					},
					{
						name: 'Create',
						value: 'create',
						description: 'Create a validated e-invoice file from invoice data',
						action: 'Create an invoice',
					},
					{
						name: 'Extract Data',
						value: 'extract',
						description: 'Read the invoice data embedded in a ZUGFeRD or Factur-X PDF',
						action: 'Extract invoice data',
					},
					{
						name: 'Render as PDF',
						value: 'render',
						description: 'Turn an XRechnung, UBL or CII invoice XML into a readable PDF',
						action: 'Render an invoice as PDF',
					},
					{
						name: 'Validate',
						value: 'validate',
						description: 'Check an e-invoice file and list every error and warning',
						action: 'Validate an invoice',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				displayOptions: { show: { resource: ['invoice'], operation: ['create', 'validate'] } },
				options: FORMAT_OPTIONS,
				default: 'xrechnung',
				description:
					'XRechnung for German public sector buyers, ZUGFeRD or Factur-X for a PDF with the XML embedded, UBL / Peppol BIS for the Peppol network',
			},
			{
				displayName: 'Invoice',
				name: 'invoice',
				type: 'json',
				required: true,
				displayOptions: { show: { resource: ['invoice'], operation: ['create'] } },
				default: JSON.stringify(EXAMPLE_INVOICE, null, 2),
				description:
					'The invoice as JSON: number, dates, seller, buyer and lines. All fields are described at https://www.invoicexml.com/docs.',
			},
			{
				displayName: 'Conversion',
				name: 'conversion',
				type: 'options',
				displayOptions: { show: { resource: ['invoice'], operation: ['convert'] } },
				options: CONVERSIONS.map(([from, to]) => ({
					name: `${FORMAT_NAMES[from]} to ${FORMAT_NAMES[to]}`,
					value: `${from}/to/${to}`,
				})),
				default: 'ubl/to/cii',
				description: 'The format of your file and the format you want',
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				required: true,
				displayOptions: {
					show: { resource: ['invoice'], operation: ['convert', 'extract', 'render', 'validate'] },
				},
				default: 'data',
				hint: 'The name of the input binary field that holds the invoice file',
			},
			{
				displayName: 'PDF Language',
				name: 'language',
				type: 'options',
				displayOptions: { show: { resource: ['invoice'], operation: ['render'] } },
				options: [
					{ name: 'English', value: 'en' },
					{ name: 'French', value: 'fr' },
					{ name: 'German', value: 'de' },
				],
				default: 'en',
				description: 'The language of the labels on the PDF',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				returnData.push(await runOperation.call(this, operation, i));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Re-wrapping a node error hands back the original, so the API message and
				// findings from the request helper are kept.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

async function runOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData> {
	if (operation === 'create') {
		const format = this.getNodeParameter('format', i) as Format;
		const raw = this.getNodeParameter('invoice', i) as string | IDataObject;
		let invoice: IDataObject;
		try {
			invoice = typeof raw === 'string' ? (JSON.parse(raw) as IDataObject) : raw;
		} catch {
			throw new NodeOperationError(this.getNode(), 'The Invoice field is not valid JSON', {
				itemIndex: i,
			});
		}

		const data = await invoiceXmlRequest.call(this, i, `/create/${format}`, { invoice });
		const extension = extensionOf(format);
		const number = typeof invoice.invoiceNumber === 'string' ? invoice.invoiceNumber : undefined;
		const fileName = outputFileName(number, `invoice-${format}`, extension);
		return {
			json: { fileName, format },
			binary: { data: await this.helpers.prepareBinaryData(data, fileName, mimeTypeOf(extension)) },
			pairedItem: { item: i },
		};
	}

	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const binary = this.helpers.assertBinaryData(i, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
	const form = new FormData();
	form.append('file', new Blob([new Uint8Array(buffer)]), binary.fileName ?? 'invoice');

	if (operation === 'validate') {
		const format = this.getNodeParameter('format', i) as Format;
		const verdict = parseJson<{
			valid: boolean;
			detail?: string | null;
			errors?: Array<{ rule?: string; message?: string; line?: number }> | null;
			warnings?: Array<{ rule?: string; message?: string; line?: number }> | null;
		}>(await invoiceXmlRequest.call(this, i, `/validate/${format}`, form));
		const errors = flattenFindings(verdict.errors);
		const warnings = flattenFindings(verdict.warnings);
		return {
			json: {
				valid: verdict.valid,
				detail: verdict.detail ?? null,
				errorCount: errors.length,
				warningCount: warnings.length,
				errors,
				warnings,
			},
			pairedItem: { item: i },
		};
	}

	if (operation === 'extract') {
		const result = parseJson<{ invoice: IDataObject }>(
			await invoiceXmlRequest.call(this, i, '/extract/json', form),
		);
		return { json: result.invoice, pairedItem: { item: i } };
	}

	if (operation === 'convert') {
		const conversion = this.getNodeParameter('conversion', i) as string;
		const target = conversion.split('/to/')[1];
		const data = await invoiceXmlRequest.call(this, i, `/convert/${conversion}`, form);
		const extension = extensionOf(target);
		const fileName = outputFileName(binary.fileName, `invoice-${target}`, extension);
		return {
			json: { fileName, format: target },
			binary: { data: await this.helpers.prepareBinaryData(data, fileName, mimeTypeOf(extension)) },
			pairedItem: { item: i },
		};
	}

	if (operation === 'render') {
		form.append('language', this.getNodeParameter('language', i) as string);
		const data = await invoiceXmlRequest.call(this, i, '/render/xml/to/pdf', form);
		const fileName = outputFileName(binary.fileName, 'invoice', 'pdf');
		return {
			json: { fileName },
			binary: { data: await this.helpers.prepareBinaryData(data, fileName, 'application/pdf') },
			pairedItem: { item: i },
		};
	}

	throw new NodeOperationError(this.getNode(), `The operation "${operation}" is not supported`, {
		itemIndex: i,
	});
}
