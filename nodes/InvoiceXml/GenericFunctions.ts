import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const BASE_URL = 'https://api.invoicexml.com/v1';

type Finding = {
	rule?: string | null;
	message?: string | null;
	line?: number | null;
};

type Problem = {
	title?: string;
	detail?: string;
	errors?: Finding[] | null;
};

/**
 * Sends one request to the InvoiceXML API and returns the raw response body.
 * Responses are read as bytes because the generating routes answer with a PDF or XML
 * file; JSON answers are parsed by the caller. A problem+json error is turned into a
 * NodeApiError that carries the API's own message and its validation findings.
 */
export async function invoiceXmlRequest(
	this: IExecuteFunctions,
	itemIndex: number,
	path: string,
	body: FormData | IDataObject,
): Promise<Buffer> {
	const isForm = body instanceof FormData;
	const response = await this.helpers.httpRequestWithAuthentication.call(this, 'invoiceXmlApi', {
		method: 'POST',
		url: `${BASE_URL}${path}`,
		body: isForm ? body : JSON.stringify(body),
		headers: isForm ? {} : { 'Content-Type': 'application/json' },
		encoding: 'arraybuffer',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	});

	const data = Buffer.from(response.body as ArrayBuffer);
	if (response.statusCode < 400) {
		return data;
	}

	let problem: Problem = {};
	try {
		problem = JSON.parse(data.toString('utf8')) as Problem;
	} catch {
		problem = { detail: data.toString('utf8') };
	}

	const findings = (problem.errors ?? [])
		.map((f) => (f.rule ? `${f.rule}: ${f.message ?? ''}` : (f.message ?? '')))
		.filter((line) => line.length > 0);

	throw new NodeApiError(this.getNode(), problem as JsonObject, {
		itemIndex,
		httpCode: String(response.statusCode),
		message: problem.detail ?? problem.title ?? `InvoiceXML returned HTTP ${response.statusCode}`,
		description: findings.length > 0 ? findings.join('\n') : undefined,
	});
}

export function parseJson<T>(data: Buffer): T {
	return JSON.parse(data.toString('utf8')) as T;
}

export function flattenFindings(findings: Finding[] | null | undefined): IDataObject[] {
	return (findings ?? []).map((f) => ({
		rule: f.rule ?? null,
		message: f.message ?? null,
		line: f.line ?? null,
	}));
}

/** The file name for a generated document: the source name with the new extension. */
export function outputFileName(
	source: string | undefined,
	fallback: string,
	extension: string,
): string {
	const base = source ? source.replace(/\.[^.]+$/, '') : fallback;
	return `${base}.${extension}`;
}
