import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class InvoiceXmlApi implements ICredentialType {
	name = 'invoiceXmlApi';

	displayName = 'InvoiceXML API';

	icon: Icon = {
		light: 'file:../nodes/InvoiceXml/invoicexml.svg',
		dark: 'file:../nodes/InvoiceXml/invoicexml.svg',
	};

	documentationUrl =
		'https://github.com/InvoiceXML/n8n-nodes-invoicexml?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your InvoiceXML API key. Log in at www.invoicexml.com and open Account > Authentication to copy it.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.invoicexml.com/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
